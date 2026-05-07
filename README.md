# NTHU Chatroom Midterm Project

This project is a Firebase chatroom app for the Software Studio midterm.

## Functions

- Email sign up/sign in and Google sign in/sign up by Firebase Authentication.
- Private chatrooms: enter a registered friend's email and click **Create Private Room**.
- Group chat: after selecting a room, enter another registered email and click **Invite To Current Room**.
- Realtime Firestore messages: all members can see messages and history is loaded when opening a room.
- Profile modal with uploadable profile picture, username, email, phone number, and address.
- The chatroom displays sender username/email and profile picture with every message.
- Message operations: reply, edit own message, unsend own message, search messages, send image as base64 data, and emoji reactions.
- Reply UI: the original message is shown above the input while typing, and clicking a reply scrolls/highlights the original message.
- XSS/code handling: message text is rendered by escaping HTML characters, so `<script>` and `<h1>` are displayed as text instead of executed as HTML.
- Responsive layout for desktop and small screens.
- CSS animation for new messages.
- Chrome notifications: click **Notify** after signing in to allow notifications for unread incoming messages while the tab is not focused.
- Block/unblock user: enter a registered email and use **Block User** or **Unblock User**. Direct chats are disabled when either side blocks the other. In group chats, messages are hidden mutually between blocker and blocked user.

## How to use the website

1. Open the deployed Firebase Hosting URL.
2. Register two accounts with different email addresses, or click **Sign in / up with Google**.
3. Sign in with one account.
4. Type the second account's email into **Friend email**.
5. Click **Create Private Room**.
6. Type a message and press **Send** or Enter.
7. Sign in with the other account in another browser/incognito window to verify realtime chat.
8. Use the buttons under each message for reply, emoji, edit, and unsend.
9. Use the image button to send an image.
10. Click **Edit** to upload a profile picture and save your profile.
11. Click **Notify** to enable Chrome notifications.
12. To block or unblock someone, enter their email in **Friend email** and click **Block User** or **Unblock User**.
13. Use the search box in the chat header to search messages.

## How to set up locally step by step

### 1. Install tools

Install Firebase CLI if it is not installed:

```bash
npm install -g firebase-tools
```

Login:

```bash
firebase login
```

### 2. Create or choose a Firebase project

In Firebase Console:

1. Create a Firebase project.
2. Add a Web App.
3. Enable **Authentication > Sign-in method > Email/Password** and **Google**.
4. Create a Firestore database.
5. Add your local/deployed domain in **Authentication > Settings > Authorized domains** if needed.

### 3. Fix Firebase config for local testing

On Firebase Hosting, `/__/firebase/init.js` automatically initializes the deployed project's config.

For local testing, open `main.js` and replace this fallback value:

```js
apiKey: "REPLACE_WITH_YOUR_REAL_API_KEY"
```

Use Firebase Console -> Project settings -> Your apps -> SDK setup and configuration.

If you see `FirebaseError: Firebase: Error (auth/invalid-api-key)`, your API key is wrong, deleted, restricted incorrectly, or the deployed site is not using the same Firebase project. Copy the Web App config again and deploy again.

### 4. Deploy Firestore rules and hosting

From this folder:

```bash
firebase use chatroom-1145141919810
firebase deploy --only firestore:rules,hosting
```

If you use another project:

```bash
firebase use --add
firebase deploy --only firestore:rules,hosting
```

### 5. Test

Open the hosting URL and create two accounts. Create a private room using the other account's email and test chat in two browsers.

## Submission reminder

Do not include `node_modules` in the ZIP file. Generate and submit the MD5 checksum according to the course SOP.


## Block / unblock behavior

- Direct chats are rooms with exactly two members and `type: "direct"` or older `type: "private"`.
- If User A blocks User B, both users will see a warning in the direct chat history and the message input/image upload will be disabled.
- User B cannot send direct messages to User A anymore. This is enforced in both the UI and Firestore security rules.
- Group chats are rooms with `type: "group"`. Blocking does not disable the whole group chat. Instead, messages between the blocker and blocked user are mutually hidden.
- To block or unblock someone, select a direct chat and press Block User / Unblock User, or type the target user's email in the Friend email box first.

## Advanced components added in this version

- **Google sign in/up:** click **Sign in / up with Google** on the login screen. In Firebase Console, remember to enable Authentication > Sign-in method > Google and add your Firebase Hosting domain to authorized domains.
- **CSS animation:** login card entrance animation, room list entrance animation, message slide-in animation, and input glow when typing.
- **Safe code sending / XSS handling:** message text is escaped before rendering. This means code such as `<script>alert("example")</script>` or `<h1>example</h1>` is shown as text, not executed or rendered as HTML. Line breaks and indentation are preserved for pasted code snippets.
