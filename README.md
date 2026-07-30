# Rail Footprint

## About (public for all users)

Stored in Firestore: **`appConfig/about`**

Field **`visible`**: `true` = show in sidebar for everyone, `false` = hide for everyone.

### After changing Hide/Show
1. Status under the button must say **confirmed on server** (not "this device only").
2. Firebase Console → Firestore → **appConfig** → **about** → check `visible` is true/false.
3. Normal user: hard refresh (live listener also updates open tabs).

### Rules (must be published)
```
match /appConfig/{docId} {
  allow read: if true;
  allow create, update, delete:
    if request.auth != null
    && request.auth.token.email.lower() == 'harshcaptain2310@gmail.com';
}
```

```bash
cd rail-footprint && python3 -m http.server 8080
```
