# RepUp Privacy Policy

_Last updated: May 10, 2025_

## What We Collect
RepUp collects the following data to provide its services:
- **GitHub profile information** (username, display name, profile photo) obtained via GitHub OAuth authentication
- **GitHub activity data** (commits, pull requests, issue comments) fetched from the public GitHub API
- **Code content** from GitHub files and pull requests you view while the code review feature is enabled
- **OAuth access tokens** stored temporarily in session storage to authenticate GitHub API requests

## How We Use Your Data
- GitHub profile information is used to identify you on the leaderboard and display your profile
- GitHub activity data is used to track your daily coding streak, award XP, and complete quests
- Code content is sent to our backend for AI-powered code review and is not stored permanently
- OAuth tokens are used solely to make authenticated requests to the GitHub API on your behalf

## Data Storage
- Your profile, XP, streak, and quest data is stored in Firebase Firestore
- Code review results are cached locally in your browser using Chrome's storage API, keyed by file SHA
- OAuth tokens are stored only in session storage and are cleared when you close the browser

## Data Sharing
We do not sell your data. Code submitted for review is processed by Google's Gemini AI API. No data is shared with third parties for advertising purposes.

## Data Deletion
You can request deletion of your data by contacting us at the GitHub repository linked below.

## Contact
For questions about this privacy policy, please open an issue at:
https://github.com/KylePraias/RepUp