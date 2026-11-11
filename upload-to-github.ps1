$ErrorActionPreference = "Stop"

$RepositoryUrl = "https://github.com/amirmalik798/multi-tenant-saas-hrms.git"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed. Install Git for Windows, then run this script again."
}

if (-not (Test-Path ".\backend\package.json") -or -not (Test-Path ".\frontend\package.json")) {
    throw "Run this script from the extracted project root. Expected backend\ and frontend\ folders."
}

if (-not (Test-Path ".git")) {
    git init -b main
    if ($LASTEXITCODE -ne 0) { throw "git init failed." }
}

$existingRemote = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and $existingRemote) {
    if ($existingRemote.TrimEnd("/") -ne $RepositoryUrl.TrimEnd("/")) {
        throw "The origin remote points to '$existingRemote', not the intended HRMS repository. No push was performed."
    }
} else {
    git remote add origin $RepositoryUrl
    if ($LASTEXITCODE -ne 0) { throw "Could not add the GitHub origin remote." }
}

git branch -M main
if ($LASTEXITCODE -ne 0) { throw "Could not set the current branch to main." }

git add -A
if ($LASTEXITCODE -ne 0) { throw "git add failed." }

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m "Initial complete HRMS source checkpoint"
    if ($LASTEXITCODE -ne 0) { throw "Commit failed. Check your Git identity configuration." }
} else {
    Write-Host "No staged changes found; existing commit will be pushed."
}

Write-Host "Pushing to $RepositoryUrl ..."
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    throw "Push failed. Complete the GitHub sign-in prompt if shown, then rerun this script."
}

Write-Host "Initial HRMS source checkpoint pushed successfully." -ForegroundColor Green
