# NTHU Chatroom Midterm Project

A Firebase-based chatroom web app for the Software Studio midterm project.

## Implementation status

### Basic components

| Requirement | Status | Where to check |
|---|---:|---|
| Email sign up | Done | Login page -> Sign Up |
| Email sign in | Done | Login page -> Sign In |
| Firebase Hosting | Done | `firebase.json`, `index.html`, `/__/firebase/init.js` |
| Authenticated database read/write | Done | `firestore.rules`, `main.js` Firestore calls |
| RWD | Done | `style.css`, media query for small screens |
| Git version control | Done | https://github.com/thanksone/Chatroom |
| Chatroom | Done | Direct rooms, group invite, history loading, realtime messages |

### Advanced components

| Requirement | Status | Notes |
|---|---:|---|
| Sign in/up with Google | Done | Enable Google provider in Firebase Console first |
| Chrome notification | Done | Click **Notify** after login; only notifies unread incoming messages when the tab is not focused |
| CSS animation | Done | Login card, room list, new messages, input glow |
| Deal with problems when sending code | Done | HTML is escaped, so `<script>` and `<h1>` show as text instead of executing/rendering |
| User profile | Done | Modal with uploadable profile picture, username, email, phone, address |
| Message operations | Done | Edit own messages, unsend own messages, search, send images |
| Framework such as React | Not used | This project uses vanilla HTML/CSS/JavaScript. This optional advanced item is not claimed. |

### Bonus-related features implemented

These are bonus items, but some are implemented:

- Block/unblock user
- Emoji reactions on messages
- Reply to specific message, including scroll/highlight original message

Not implemented:

- Chatbot
- Tenor GIF sending
- Custom sticker drawing canvas

## Main functions

### Authentication

Users can create an account with email/password or sign in/sign up with Google. Firebase Authentication is used for all login flows.

### Profile

Click **Edit** in the sidebar to open the profile modal. The profile contains:

- Profile picture upload
- Username
- Email display
- Phone number
- Address

The profile picture and username/email are displayed in chat messages.

### Direct chatroom

1. Sign in.
2. Enter another registered user's email in the **Friend email** field.
3. Click **Create Direct Room**.
4. The direct room appears in the room list.
5. Click the room and send messages.

### Group chatroom

1. Open an existing direct room.
2. Enter another registered user's email in the **Friend email** field.
3. Click **Invite To Current Room**.
4. The room becomes a group chat.

### Messages

Inside a selected room, users can:

- Send text messages
- Send images
- Reply to specific messages
- Click a replied message to scroll/highlight the original message
- Add/remove emoji reactions
- Edit their own messages
- Unsend their own messages
- Search messages using the search box

### Code-safe sending

Messages are rendered with escaped HTML. For example, sending this:

```html
<script>alert("example")</script>
<h1>example</h1>
```

will display the code as plain text instead of running the script or rendering an actual heading.

### Chrome notifications

1. Sign in.
2. Click **Notify**.
3. Allow notifications in Chrome.
4. When the tab is not focused, incoming messages from other users create unread notifications.

### Block/unblock user

Enter a registered user's email in **Friend email**, then click **Block User** or **Unblock User**.

Direct chat behavior:

- If User A blocks User B, both users still see the existing chat history.
- The direct chat displays a warning notification.
- The message input, image upload, and send button are disabled.
- User B cannot send direct messages to User A anymore.
- After User A unblocks User B, the direct chat can be used again.

Group chat behavior:

- Blocking does not disable the group chat.
- Messages between blocker and blocked user are mutually hidden.

## Firebase setup

### 1. Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### 2. Create or choose a Firebase project

In Firebase Console:

1. Create a Firebase project.
2. Add a Web App.
3. Enable **Authentication -> Sign-in method -> Email/Password**.
4. Enable **Authentication -> Sign-in method -> Google**.
5. Create a Firestore database.
6. Add your Firebase Hosting domain to **Authentication -> Settings -> Authorized domains** if needed.

### 3. Firebase config

On Firebase Hosting, this line in `index.html` automatically loads the correct Firebase project config:

```html
<script src="/__/firebase/init.js"></script>
```

For local testing without Firebase Hosting, open `main.js` and make sure `fallbackFirebaseConfig` matches your Firebase Web App config from:

```text
Firebase Console -> Project settings -> Your apps -> SDK setup and configuration
```

### 4. Deploy Firestore rules and hosting

If this is your Firebase project:

```bash
firebase use chatroom-1145141919810
firebase deploy --only firestore:rules,hosting
```

If you are using another project:

```bash
firebase use --add
firebase deploy --only firestore:rules,hosting
```

### 5. Test locally with Firebase Hosting emulator

```bash
firebase emulators:start --only hosting,firestore
```

Then open the local hosting URL shown in the terminal.
