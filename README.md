# Rail Footprint

## About (public)

Admin edits, owner stats, and **Hide/Show About** are stored in Firestore document:

`appConfig/about`

Every visitor loads this on startup, so hide/unhide and stats work for **all users**, not only the admin browser.

### Required Firestore rules (Firebase Console → Firestore → Rules)

```
match /appConfig/{docId} {
  allow read: if true;
  allow write: if request.auth != null
    && request.auth.token.email.lower() == 'harshcaptain2310@gmail.com';
}
```

After deploying rules, open **Admin → About page content → Save About page** (or Hide/Show) once so the public document is created.

### Local cache
A localStorage cache keeps About fast offline; it is overwritten when the public document loads.

```bash
cd rail-footprint && python3 -m http.server 8080
```
