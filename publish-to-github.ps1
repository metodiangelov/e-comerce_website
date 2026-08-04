param(
  [Parameter(Mandatory=$true)][string]$GitHubUser,
  [string]$Repository = "koshnitsa-shop"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is not installed. Install Git for Windows first."
}

if (Test-Path ".env") {
  Write-Host "Good: .env is ignored by .gitignore and will not be committed."
}

if (-not (Test-Path ".git")) {
  git init
}

git add .
git commit -m "Initial Koshnitsa shop"
git branch -M main

$remote = "https://github.com/$GitHubUser/$Repository.git"
if ((git remote) -contains "origin") {
  git remote set-url origin $remote
} else {
  git remote add origin $remote
}

git push -u origin main
