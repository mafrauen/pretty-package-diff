#!/usr/bin/env node
import chalk from 'chalk';

import { run } from './index.js';

const isVerbose = process.argv.find(arg => ['-v', '--verbose'].includes(arg));
const loadAddedPackageSizes = process.argv.find(arg => arg === '--sizes-added');
const loadRemovedPackageSizes = process.argv.find(arg => arg === '--sizes-removed');
const isJson = process.argv.find(arg => arg === '--json');

const toKilobytes = (size) => (size / 1024).toFixed(2);

function print (dependencies) {
  console.table(
    dependencies.map(d => {
      if (!d.isMajorUpgrade) {
        delete d.isMajorUpgrade;
      }
      return d;
    })
  );
}

const requestSize = (name, version) => {
  const url = `https://bundlephobia.com/api/size?package=${name}@${version}`;
  return fetch(url, {
    headers: {
      'X-Bundlephobia-User': 'pretty-package-diff'
    }
  });
};

const loadSizes = async (deps, getVersions) => {
  // array pairs of [name, version]
  const dependencyVersions = [];
  deps.forEach((dep) => {
    getVersions(dep).forEach(version => {
      dependencyVersions.push([dep, version]);
    });
  });

  // Split up the requests to avoid hitting the server too often
  const dependencyGroups = [];
  const groupSize = 4;
  for (let x = 0; x < dependencyVersions.length; x += groupSize) {
    dependencyGroups.push(dependencyVersions.slice(x, x + groupSize));
  }

  for (const dependencies of dependencyGroups) {
    const promises = dependencies.map(([dep, version]) => {
      return requestSize(dep.dependency, version)
        .then((response) => response.json())
        .then(json => {
          dep.size = json.size + (dep.size ?? 0);
        })
        .catch(() => {
          // do nothing
        });
    });
    console.log(`Requesting sizes for ${dependencies.map(([{ dependency }, version]) => `${dependency}@${version}`).join(', ')}`);
    // wait until those requests complete
    await Promise.all(promises);
    // add a delay before making the next fetch requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};

async function printOutput ({ added, removed, updated }) {
  if (added.length) {
    let totalSize = 0;
    if (loadAddedPackageSizes) {
      await loadSizes(added, dep => dep.addedVersions);
      added.forEach(dep => {
        if (!dep.size) return;
        totalSize += dep.size;
        dep.size = `${toKilobytes(dep.size)}KB`;
      });
    }
    console.log(chalk.red(`${added.length} packages added`));
    print(Object.values(added));
    if (loadAddedPackageSizes) {
      console.log(`Total size added: ${toKilobytes(totalSize)}KB`);
    }
  }

  if (removed.length) {
    if (added.length) console.log('');
    let totalSize = 0;
    if (loadRemovedPackageSizes) {
      await loadSizes(removed, dep => dep.removedVersions);
      removed.forEach(dep => {
        if (!dep.size) return;
        totalSize += dep.size;
        dep.size = `${toKilobytes(dep.size)}KB`;
      });
    }
    console.log(chalk.green(`${removed.length} packages removed`));
    print(Object.values(removed));
    if (loadRemovedPackageSizes) {
      console.log(`Total size removed: ${toKilobytes(totalSize)}KB`);
    }
  }

  const changed = isVerbose ? updated : updated.filter(d => d.isMajorUpgrade);
  if (changed.length) {
    if (removed.length) console.log('');
    console.log(`${changed.length} packages updated`);
    print(Object.values(changed));
  }

  const uninteresting = isVerbose ? [] : updated.filter(d => !d.isMajorUpgrade);
  if (uninteresting.length) {
    if (changed.length) console.log('');
    console.log(`${uninteresting.length} packages have minor updates`);
  }
}

run().then(({ added, removed, updated }) => {
  if (isJson) {
    console.log(JSON.stringify({ added, removed, updated }, null, 2));
    return;
  }

  if (loadAddedPackageSizes || loadRemovedPackageSizes) {
    console.log('Loading package sizes is an experimental feature. It will take longer and may still not always return valid results');
  }
  printOutput({ added, removed, updated });
});
