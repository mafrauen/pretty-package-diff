const chalk = require("chalk");

const { parseLockfile, sortResolved } = require("./yarn");

const isVerbose = process.argv.find(arg => ["-v", "--verbose"].includes(arg));
const isTabular = process.argv.find(arg => ["-t", "--table"].includes(arg));

const vers = a => (a || []).join(", ");

function print(dependencies) {
  if (isTabular) {
    console.table(
      dependencies.map(d => {
        if (!d.isMajorUpgrade) {
          delete d.isMajorUpgrade;
        }
        return d;
      })
    );
  } else {
    dependencies.forEach(
      ({ dependency, addedVersions, removedVersions, isMajorUpgrade }) => {
        const modifier = isMajorUpgrade ? chalk.yellow(" major upgrade") : "";
        let version;
        if (addedVersions.length && !removedVersions.length) {
          version = vers(addedVersions);
        } else if (removedVersions.length && !addedVersions.length) {
          version = vers(removedVersions);
        } else {
          version = `${vers(removedVersions)} => ${vers(addedVersions)}`;
        }

        console.log(`${dependency}${modifier}\t${version}`);
      }
    );
  }
}

function printOutput({ added, removed, updated }) {
  if (added.length) {
    console.log(chalk.red(`${added.length} packages added`));
    print(Object.values(added));
  }

  if (removed.length) {
    if (added.length) console.log("");
    console.log(chalk.green(`${removed.length} packages removed`));
    print(Object.values(removed));
  }

  const changed = isVerbose ? updated : updated.filter(d => d.isMajorUpgrade);
  if (changed.length) {
    if (removed.length) console.log("");
    console.log(`${changed.length} packages updated`);
    print(Object.values(changed));
  }

  const uninteresting = isVerbose ? [] : updated.filter(d => !d.isMajorUpgrade);
  if (uninteresting.length) {
    if (changed.length) console.log("");
    console.log(`${uninteresting.length} packages have minor updates`);
  }
}

parseLockfile(process.stdin)
  .then(sortResolved)
  .then(printOutput);
