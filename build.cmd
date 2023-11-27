git tag -d v1.0.0
git push origin -d v1.0.0
git status
git add .
git commit --amend -m "refactor"
git push -f
git tag -s v1.0.0 -m v1.0.0
git push --tags
