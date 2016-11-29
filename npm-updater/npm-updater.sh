#!/bin/bash

rm -rf $cloneToDir

export IFS=";"
#repos="one;two;three"
for repo in $repos; do
  updateDependencies $repo  
done

updateDependencies () {
  repo=$1
  cloneTo="repo"
  git clone $repo $cloneToDir
  cd $cloneToDir
  
  if [ -f ./package.json ];
  then
    npm install npm-check-updates
    ncu -a
    branchName=maintenance/version-bump-`date +"%F_%s"`
    git co -b $branchName
    git commit -am .
    #git push
  else
    echo "Nothing to do - package.json does not exist"
  fi
}





