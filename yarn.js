const semver = require("semver");

const versionString = /^(.+)@(.+)$/;

let currentDep;
let added = [];
let removed = [];
let resolved = {};

function storeUnresolved(line) {
  // Given a line like
  //    +"@atlaskit/blanket@^10.0.1", "@atlaskit/blanket@^10.0.14":
  // Set currentDep to `@atlaskit/blanket`
  // and currentVersions to `["^10.0.1", "^10.0.14"]`
  let isAdded = line[0] === "+";
  // remove added/removed indicator and colon
  line = line.slice(1, -1);

  let currentVersions = line.split(", ").map(depVersion => {
    let [, name, version] = depVersion.replace(/"/g, "").match(versionString);
    currentDep = name;
    return version;
  });

  if (isAdded) {
    added = added.concat(currentVersions);
  } else {
    removed = removed.concat(currentVersions);
  }
}

function resolveVersion(version) {
  resolved[currentDep] = resolved[currentDep] || {};
  resolved[currentDep][version] = resolved[currentDep][version] || {
    old: [],
    new: []
  };

  let dependencyVersion = resolved[currentDep][version];
  dependencyVersion.old = dependencyVersion.old.concat(removed);
  dependencyVersion.new = dependencyVersion.new.concat(added);

  // reset global vars
  added = [];
  removed = [];
  currentDep = undefined;
}

// Returns an object with format
// {
//   dependencyName: {
//     resolvedVersion: [package versions]
//     ...
//   }
// }
async function parseLockfile(readable) {
  readable.setEncoding("utf8");
  for await (const chunk of readable) {
    for (let line of chunk.split("\n")) {
      if (line.match(/^[+-]\S.*:$/)) {
        storeUnresolved(line);
      }
      const versionMatch = line.match(/^[+-]?\s{2,3}version "(.*)"/);
      if (versionMatch && currentDep) {
        resolveVersion(versionMatch[1]);
      }
    }
  }
  return resolved;
}

// Only check for versions that are exclusively old or new.
// If a resovled version has old AND new values, that just means a
// difference in the package versions that point to the resolved dependency.
// That's no change to the resolved packages, so ignore it.
const hasOld = ([, values]) => values.old.length && !values.new.length;
const hasNew = ([, values]) => values.new.length && !values.old.length;
const entryToVersion = ([v]) => v;

// Returns an object containing 3 arrays:
//   {
//     added,
//     removed,
//     updated,
//   }
//
// Each array is filled with objects in the following format
//   {
//     dependency: 'Name of the dependency',
//     addedVersions: [array of versions added],
//     removedVersions: [array of versions removed],
//     isMajorUpgrade: boolean whether the version change is major
//   }
function sortResolved(resolved) {
  const added = [];
  const removed = [];
  const updated = [];

  Object.entries(resolved).forEach(([dependency, versions]) => {
    const entries = Object.entries(versions);

    const addedVersions = entries.filter(hasNew).map(entryToVersion);
    const removedVersions = entries.filter(hasOld).map(entryToVersion);

    // If there are no changes to resolved versions
    if (
      addedVersions.length === removedVersions.length &&
      !addedVersions.filter(a => !removedVersions.includes(a)).length
    ) {
      return;
    }

    const isMajorUpgrade =
      addedVersions.length &&
      removedVersions.length &&
      addedVersions.every(a =>
        removedVersions.find(r => semver.major(a) > semver.major(r))
      );

    if (addedVersions.length > removedVersions.length) {
      added.push({
        dependency,
        addedVersions,
        removedVersions,
        isMajorUpgrade
      });
    } else if (removedVersions.length > addedVersions.length) {
      removed.push({
        dependency,
        addedVersions,
        removedVersions,
        isMajorUpgrade
      });
    } else {
      updated.push({
        dependency,
        addedVersions,
        removedVersions,
        isMajorUpgrade
      });
    }
  });

  return { added, removed, updated };
}

module.exports = {
  parseLockfile,
  sortResolved
};
