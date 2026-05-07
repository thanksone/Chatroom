// IMPORTANT: On Firebase Hosting, /__/firebase/init.js initializes the correct config.
// For local testing with VS Code Live Server or python -m http.server, replace this fallback
// with the config from Firebase Console -> Project settings -> Your apps -> Web app.
const fallbackFirebaseConfig = {
  apiKey: "AIzaSyAEUVRsW3FM4TCnxHpufmmkxaw-Pi-ZP7s",
  authDomain: "chatroom-1145141919810.firebaseapp.com",
  projectId: "chatroom-1145141919810",
  storageBucket: "chatroom-1145141919810.appspot.com",
  messagingSenderId: "930568648338",
  appId: "1:930568648338:web:0c5b8f0f5d505549f9d84b"
};

if (!firebase.apps.length) {
	let firebaseApp;

	if (firebase.apps && firebase.apps.length > 0) {
	  firebaseApp = firebase.app();
	} else {
	  firebaseApp = firebase.initializeApp(fallbackFirebaseConfig);
	}

	const auth = firebaseApp.auth();
	const db = firebaseApp.firestore();
}

const auth = firebase.auth();
const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

let currentUser = null;
let currentProfile = null;
let currentRoomId = null;
let currentRoomData = null;

let activeRoomId = null;
let activeRoom = null;
let selectedProfilePhotoData = "";
let notifiedMessageIdsByRoom = new Map();
let initializedMessageRooms = new Set();
let unsubscribeRooms = null;
let unsubscribeMessages = null;
let unsubscribeMemberProfiles = [];
let replyTarget = null;
let allMessages = [];
let knownUsers = new Map();
let emojiTargetId = null;

const $ = (id) => document.getElementById(id);
const clean = (text = "") => String(text).replace(/[&<>'"]/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[c]));

function showError(error) {
  const message = error && error.message ? error.message : String(error);
  console.error(error);
  $("auth-error").textContent = message;
}

function userLabel(uid) {
  const u = knownUsers.get(uid);
  return clean((u && (u.username || u.email)) || "Unknown user");
}

function userPhoto(uid) {
  const u = knownUsers.get(uid);
  return (u && u.photoURL) || "https://placehold.co/80x80?text=User";
}

function blockedUsersOf(profile) {
  return Array.isArray(profile?.blockedUsers) ? profile.blockedUsers : [];
}

function iBlocked(uid) {
  return blockedUsersOf(currentProfile).includes(uid);
}

function blockedMe(uid) {
  return blockedUsersOf(knownUsers.get(uid)).includes(currentUser?.uid);
}

function isDirectRoom(room = activeRoom) {
  const members = room?.members || [];
  return members.length === 2 && room?.type !== "group";
}

function getOtherDirectMember(room = activeRoom) {
  if (!isDirectRoom(room) || !currentUser) return null;
  return (room.members || []).find((uid) => uid !== currentUser.uid) || null;
}

function isHiddenByBlock(senderUid) {
  // In group chats, blocked users should be mutually hidden.
  // In direct chats, old history remains visible, but sending is disabled with a warning.
  if (!senderUid || senderUid === currentUser?.uid) return false;
  if (isDirectRoom()) return false;
  return iBlocked(senderUid) || blockedMe(senderUid);
}

function activeDirectBlockInfo() {
  if (!activeRoom || !currentUser || !isDirectRoom()) return { blocked: false, message: "" };
  const otherUid = getOtherDirectMember();
  if (!otherUid) return { blocked: false, message: "" };

  if (iBlocked(otherUid)) {
    return {
      blocked: true,
      message: `You blocked ${userLabel(otherUid)}. This direct chat is disabled until you unblock this user.`
    };
  }

  if (blockedMe(otherUid)) {
    return {
      blocked: true,
      message: `${userLabel(otherUid)} has blocked you. You can no longer send direct messages to this user.`
    };
  }

  return { blocked: false, message: "" };
}

function updateChatInputState() {
  const info = activeDirectBlockInfo();
  const warning = $("block-warning");
  if (warning) warning.textContent = info.message;
  const disabled = !activeRoomId || info.blocked;
  $("msg-input").disabled = disabled;
  $("send-btn").disabled = disabled;
  $("image-input").disabled = disabled;
}
function cleanupSessionUI() {
  if (unsubscribeRooms) {
    unsubscribeRooms();
    unsubscribeRooms = null;
  }

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  unsubscribeMemberProfiles.forEach((unsubscribe) => unsubscribe());
  unsubscribeMemberProfiles = [];

  currentUser = null;
  currentProfile = null;
  activeRoomId = null;
  activeRoom = null;
  replyTarget = null;
  allMessages = [];
  emojiTargetId = null;
  selectedProfilePhotoData = "";

  $("room-list").innerHTML = "";
  $("messages").innerHTML = "";
  $("current-room-name").textContent = "Select a chat";
  $("room-members").textContent = "";
  $("msg-input").value = "";
  $("invite-email").value = "";
  $("search-input").value = "";
  $("invite-room-btn").disabled = true;
  $("block-warning").textContent = "";
  $("msg-input").disabled = true;
  $("send-btn").disabled = true;
  $("image-input").disabled = true;

  $("app").classList.add("hidden");
  $("auth-container").classList.remove("hidden");
}

async function ensureUserProfile(user) {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  const base = {
    uid: user.uid,
    email: user.email,
    username: user.email ? user.email.split("@")[0] : "User",
    photoURL: user.photoURL || "",
    phone: "",
    address: "",
    blockedUsers: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  if (!snap.exists) {
    await ref.set(base);
    return { ...base, createdAt: null, updatedAt: null };
  }
  await ref.set({ email: user.email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ...snap.data(), email: user.email };
}

function renderCurrentUser() {
  $("display-name").textContent = currentProfile.username || currentUser.email;
  $("display-email").textContent = currentUser.email || "";
  $("user-avatar").src = currentProfile.photoURL || "https://placehold.co/80x80?text=Me";
}

$("signup-btn").onclick = async () => {
  try {
    $("auth-error").textContent = "";
    await auth.createUserWithEmailAndPassword($("email").value.trim(), $("password").value);
  } catch (e) { showError(e); }
};

$("login-btn").onclick = async () => {
  try {
    $("auth-error").textContent = "";
    await auth.signInWithEmailAndPassword($("email").value.trim(), $("password").value);
  } catch (e) { showError(e); }
};

$("logout-btn").onclick = async () => {
  cleanupSessionUI();
  await auth.signOut();
};

$("send-btn").onclick = sendMessage;
$("msg-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) sendMessage();
});
$("search-input").addEventListener("input", () => renderMessages(false));
$("cancel-reply").onclick = clearReply;

$("open-profile").onclick = () => {
  selectedProfilePhotoData = currentProfile.photoURL || "";
  $("profile-photo-file").value = "";
  $("profile-photo-preview").src = selectedProfilePhotoData || "https://placehold.co/96x96?text=Me";
  $("profile-username").value = currentProfile.username || "";
  $("profile-email").value = currentUser.email || "";
  $("profile-phone").value = currentProfile.phone || "";
  $("profile-address").value = currentProfile.address || "";
  $("profile-modal").showModal();
};
$("close-profile-btn").onclick = () => $("profile-modal").close();
$("save-profile-btn").onclick = saveProfile;
$("profile-photo-file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    selectedProfilePhotoData = await resizeImageToDataUrl(file, 256, 256, 0.75);
    $("profile-photo-preview").src = selectedProfilePhotoData;
  } catch (err) {
    showError(err);
  }
};
$("notify-btn").onclick = requestNotificationPermission;
$("block-user-btn").onclick = blockUserFromInput;
$("unblock-user-btn").onclick = unblockUserFromInput;

$("create-room-btn").onclick = createPrivateRoom;
$("invite-room-btn").onclick = inviteToCurrentRoom;
$("emoji-btn").onclick = (e) => {
  emojiTargetId = null;

  const picker = $("emoji-picker");

  if (!picker.classList.contains("hidden")) {
    picker.classList.add("hidden");
    return;
  }

  picker.classList.remove("hidden");

  const rect = e.currentTarget.getBoundingClientRect();
  picker.style.position = "fixed";
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.top - 60}px`;
  picker.style.bottom = "auto";
  picker.style.zIndex = "9999";
};

document.querySelectorAll(".emoji-item").forEach((item) => {
  item.onclick = async () => {
    try {
      if (emojiTargetId) {
        await toggleReaction(emojiTargetId, item.textContent);
        emojiTargetId = null;
      } else {
        $("msg-input").value += item.textContent;
      }

      $("emoji-picker").classList.add("hidden");
    } catch (e) {
      showError(e);
    }
  };
});

$("image-input").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file || !activeRoomId) return;
    const blockInfo = activeDirectBlockInfo();
    if (blockInfo.blocked) { alert(blockInfo.message); return; }

    const imageData = await resizeImageToDataUrl(file, 800, 800, 0.7);

    await db.collection("rooms")
      .doc(activeRoomId)
      .collection("messages")
      .add({
        type: "image",
        imageData,
        text: "",
        sender: currentUser.uid,
        senderName: currentProfile.username || currentUser.email,
        senderEmail: currentUser.email,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        edited: false,
        reactions: [],
        deleted: false,
        replyTo: replyTarget ? {
          id: replyTarget.id,
          text: replyTarget.text || "[Image]",
          senderName: replyTarget.senderName || ""
        } : null
      });

    await db.collection("rooms").doc(activeRoomId).update({
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    clearReply();
    e.target.value = "";
  } catch (err) {
    showError(err);
  }
};
auth.onAuthStateChanged(async (user) => {
  cleanupSessionUI();

  if (!user) {
    return;
  }

  try {
    currentUser = user;
    currentProfile = await ensureUserProfile(user);
    knownUsers = new Map();
    knownUsers.set(user.uid, currentProfile);

    renderCurrentUser();

    $("auth-container").classList.add("hidden");
    $("app").classList.remove("hidden");

    loadRooms();
  } catch (e) {
    showError(e);
  }
});
async function saveProfile() {
  const data = {
    photoURL: selectedProfilePhotoData || currentProfile.photoURL || "",
    username: $("profile-username").value.trim() || currentUser.email.split("@")[0],
    phone: $("profile-phone").value.trim(),
    address: $("profile-address").value.trim(),
    updatedAt: FieldValue.serverTimestamp()
  };
  await db.collection("users").doc(currentUser.uid).set(data, { merge: true });
  currentProfile = { ...currentProfile, ...data };
  knownUsers.set(currentUser.uid, currentProfile);
  renderCurrentUser();
  renderMessages(false);
  $("profile-modal").close();
}

async function findUserByEmail(email) {
  const targetEmail = email.trim().toLowerCase();
  if (!targetEmail) throw new Error("Please enter your friend's email first.");
  const q = await db.collection("users").where("email", "==", targetEmail).limit(1).get();
  if (q.empty) throw new Error("No registered user found with that email. Ask the user to sign up first.");
  const doc = q.docs[0];
  knownUsers.set(doc.id, doc.data());
  return { uid: doc.id, ...doc.data() };
}

async function createPrivateRoom() {
  try {
    const friend = await findUserByEmail($("invite-email").value);
    if (iBlocked(friend.uid)) throw new Error("You blocked this user. Unblock them before creating a private room.");
    if (blockedUsersOf(friend).includes(currentUser.uid)) throw new Error("This user has blocked you, so you cannot create a private room with them.");
    const members = [currentUser.uid, friend.uid].sort();
    const roomId = members.join("_");

    const room = {
      type: "direct",
      name: `${currentProfile.username || currentUser.email} / ${friend.username || friend.email}`,
      members,
      memberEmails: [currentUser.email, friend.email],
      memberKey: roomId,
      createdBy: currentUser.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const ref = db.collection("rooms").doc(roomId);
    await ref.set(room, { merge: true });

    selectRoom(ref.id, room);
  } catch (e) {
    alert(e.message || e);
  }
}

async function inviteToCurrentRoom() {
  try {
    if (!activeRoomId) return;
    const friend = await findUserByEmail($("invite-email").value);
    await db.collection("rooms").doc(activeRoomId).update({
      members: FieldValue.arrayUnion(friend.uid),
      memberEmails: FieldValue.arrayUnion(friend.email),
      type: "group",
      updatedAt: FieldValue.serverTimestamp()
    });
  } catch (e) { alert(e.message || e); }
}

function loadRooms() {
  if (unsubscribeRooms) {
    unsubscribeRooms();
    unsubscribeRooms = null;
  }
  unsubscribeRooms = db.collection("rooms")
    .where("members", "array-contains", currentUser.uid)
    .onSnapshot((snap) => {
      const list = $("room-list");
      list.innerHTML = "";
      snap.docs
        .sort((a, b) => (b.data().updatedAt?.seconds || 0) - (a.data().updatedAt?.seconds || 0))
        .forEach((doc) => {
          const room = doc.data();
          const btn = document.createElement("button");
          btn.className = "room-item" + (doc.id === activeRoomId ? " active" : "");
          btn.innerHTML = `<strong>${clean(room.name || "Chatroom")}</strong><br><small>${(room.memberEmails || []).map(clean).join(", ")}</small>`;
          btn.onclick = () => selectRoom(doc.id, room);
          list.appendChild(btn);
        });
    }, (e) => alert(e.message));
}

async function loadMemberProfiles(memberIds = []) {
  await Promise.all(memberIds.map(async (uid) => {
    const snap = await db.collection("users").doc(uid).get();
    if (snap.exists) knownUsers.set(uid, snap.data());
  }));
}

function listenMemberProfiles(memberIds = []) {
  unsubscribeMemberProfiles.forEach((unsubscribe) => unsubscribe());
  unsubscribeMemberProfiles = [];

  memberIds.forEach((uid) => {
    const unsubscribe = db.collection("users").doc(uid).onSnapshot((snap) => {
      if (!snap.exists) return;
      knownUsers.set(uid, snap.data());

      if (uid === currentUser?.uid) {
        currentProfile = { ...currentProfile, ...snap.data() };
        renderCurrentUser();
      }

      updateChatInputState();
      renderMessages(false);
    }, (error) => showError(error));

    unsubscribeMemberProfiles.push(unsubscribe);
  });
}

async function selectRoom(roomId, room) {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  activeRoomId = roomId;
  activeRoom = room;
  allMessages = [];

  $("current-room-name").textContent = room.name || "Chatroom";
  $("room-members").textContent = (room.memberEmails || []).join(", ");
  $("messages").innerHTML = "";
  $("invite-room-btn").disabled = false;
  await loadMemberProfiles(room.members || []);
  listenMemberProfiles(room.members || []);
  updateChatInputState();

  clearReply();

  unsubscribeMessages = db.collection("rooms")
    .doc(roomId)
    .collection("messages")
    .orderBy("timestamp", "asc")
	.onSnapshot((snap) => {
	  const box = $("messages");
	  const firstLoad = allMessages.length === 0;
	  const wasNearBottom = box ? isNearBottom(box) : true;

	  allMessages = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      maybeNotifyUnreadMessages(roomId, allMessages, firstLoad);
      renderMessages(firstLoad || wasNearBottom);
	}, (error) => {
	  showError(error);
	});
}

async function addMessage(extra) {
  if (!activeRoomId) return;
  const blockInfo = activeDirectBlockInfo();
  if (blockInfo.blocked) {
    alert(blockInfo.message);
    return;
  }
  const data = {
    sender: currentUser.uid,
    senderName: currentProfile.username || currentUser.email,
    senderEmail: currentUser.email,
    text: extra.text || "",
    imageData: extra.imageData || "",
    timestamp: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    replyTo: replyTarget,
    reactions: [],
    deleted: false
  };
  await db.collection("rooms").doc(activeRoomId).collection("messages").add(data);
  clearReply();
}

async function sendMessage() {
  const text = $("msg-input").value.trim();
  if (!text || !activeRoomId) return;

  await addMessage({ text });
  $("msg-input").value = "";

  scrollMessagesToBottom();
}

function setReplyMessage(msg) {
  replyTarget = { id: msg.id, text: msg.text || "[image]", senderName: msg.senderName || userLabel(msg.sender) };
  $("reply-text").textContent = `${replyTarget.senderName}: ${replyTarget.text}`;
  $("reply-preview").classList.remove("hidden");
}

function clearReply() {
  replyTarget = null;

  const preview = $("reply-preview");
  const text = $("reply-text");

  if (preview) preview.classList.add("hidden");
  if (text) text.textContent = "";
}
function resizeImageToDataUrl(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);

        if (dataUrl.length > 900000) {
          reject(new Error("Image is still too large. Please choose a smaller image."));
          return;
        }

        resolve(dataUrl);
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function scrollMessagesToBottom() {
  const box = $("messages");
  if (!box) return;

  requestAnimationFrame(() => {
    box.scrollTop = box.scrollHeight;
  });
}

function isNearBottom(element, distance = 120) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < distance;
}
function openEmojiPickerForMessage(msgId, anchorEl) {
  emojiTargetId = msgId;

  const picker = $("emoji-picker");
  picker.classList.remove("hidden");

  const rect = anchorEl.getBoundingClientRect();

  const pickerWidth = picker.offsetWidth || 230;
  const pickerHeight = picker.offsetHeight || 60;

  let left = rect.left;
  let top = rect.bottom + 6;

  if (left + pickerWidth > window.innerWidth - 8) {
    left = window.innerWidth - pickerWidth - 8;
  }

  if (left < 8) {
    left = 8;
  }

  if (top + pickerHeight > window.innerHeight - 8) {
    top = rect.top - pickerHeight - 6;
  }

  if (top < 8) {
    top = 8;
  }

  picker.style.position = "fixed";
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
  picker.style.bottom = "auto";
  picker.style.zIndex = "9999";
}

function renderMessages(shouldScroll = false) {
  const box = $("messages");
  const keyword = $("search-input").value.trim().toLowerCase();
  box.innerHTML = "";
  const shown = allMessages.filter((m) => {
    if (isHiddenByBlock(m.sender)) return false;
    return !keyword || (m.text || "").toLowerCase().includes(keyword) || (m.senderName || "").toLowerCase().includes(keyword);
  });
  if (!activeRoomId) {
    box.innerHTML = `<p class="hint">Create or select a room to start chatting.</p>`;
    return;
  }
  shown.forEach((m) => {
    const mine = m.sender === currentUser.uid;
    const div = document.createElement("article");
    div.id = `msg-${m.id}`;
    div.className = `message ${mine ? "my-msg" : "other-msg"} ${m.deleted ? "deleted" : ""}`;
    const time = m.timestamp ? new Date(m.timestamp.seconds * 1000).toLocaleString() : "sending...";
    const replyHtml = m.replyTo ? `<div class="reply-box" data-reply-id="${clean(m.replyTo.id)}">↪ ${clean(m.replyTo.senderName || "")}: ${clean(m.replyTo.text || "[image]")}</div>` : "";
    const bodyHtml = m.deleted
      ? `<em>Message unsent</em>`
      : `${clean(m.text || "")}${m.imageData ? `<img class="message-image" src="${m.imageData}" alt="sent image">` : ""}`;
	const reactionList = Array.isArray(m.reactions) ? m.reactions : [];
	const reactions = reactionList
	  .map((r) => `<span class="reaction">${clean(r.emoji)} ${clean(userLabel(r.uid))}</span>`)
	  .join("");
    div.innerHTML = `
      <div class="message-header">
        <img class="message-avatar" src="${clean(userPhoto(m.sender))}" alt="avatar">
        <div class="meta">${clean(m.senderName || userLabel(m.sender))} · ${time}</div>
      </div>
      ${replyHtml}
      <div class="body">${bodyHtml}</div>
      <div class="reactions">${reactions}</div>
      ${m.deleted ? "" : `<div class="message-actions">
        <button data-action="reply">Reply</button>
        <button data-action="react">Emoji</button>
        ${mine ? `<button data-action="edit">Edit</button><button data-action="unsend">Unsend</button>` : ""}
      </div>`}`;
    div.querySelector('[data-action="reply"]')?.addEventListener("click", () => setReplyMessage(m));
    const reactBtn = div.querySelector('[data-action="react"]');
    reactBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      openEmojiPickerForMessage(m.id, reactBtn);
    });
    div.querySelector('[data-action="edit"]')?.addEventListener("click", () => editMessage(m));
    div.querySelector('[data-action="unsend"]')?.addEventListener("click", () => unsendMessage(m.id));
    div.querySelector(".reply-box")?.addEventListener("click", () => scrollToMessage(m.replyTo.id));
    box.appendChild(div);
  });
  if (shouldScroll) {
	  scrollMessagesToBottom();

	  box.querySelectorAll("img").forEach((img) => {
		img.onload = scrollMessagesToBottom;
	  });
	}
}

async function editMessage(msg) {
  const newText = prompt("Edit your message:", msg.text || "");
  if (newText === null) return;
  await db.collection("rooms").doc(activeRoomId).collection("messages").doc(msg.id).update({
    text: newText.trim(),
    updatedAt: FieldValue.serverTimestamp()
  });
}

async function unsendMessage(msgId) {
  if (!confirm("Unsend this message?")) return;
  await db.collection("rooms").doc(activeRoomId).collection("messages").doc(msgId).update({
    text: "",
    imageData: "",
    deleted: true,
    updatedAt: FieldValue.serverTimestamp()
  });
}

async function toggleReaction(msgId, emoji) {
  try {
    const ref = db.collection("rooms")
      .doc(activeRoomId)
      .collection("messages")
      .doc(msgId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const msg = snap.data() || {};

      let reactions = Array.isArray(msg.reactions) ? msg.reactions : [];

      const existing = reactions.find(
        (r) => r.uid === currentUser.uid && r.emoji === emoji
      );

      if (existing) {
        reactions = reactions.filter(
          (r) => !(r.uid === currentUser.uid && r.emoji === emoji)
        );
      } else {
        reactions.push({
          uid: currentUser.uid,
          emoji
        });
      }

      tx.update(ref, {
        reactions,
        updatedAt: FieldValue.serverTimestamp()
      });
    });
  } catch (e) {
    showError(e);
  }
}

function scrollToMessage(msgId) {
  const el = document.getElementById(`msg-${msgId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("highlight");
  setTimeout(() => el.classList.remove("highlight"), 1600);
}


async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("This browser does not support Chrome notifications.");
    return;
  }
  const result = await Notification.requestPermission();
  alert(result === "granted" ? "Chrome notifications enabled." : "Notification permission was not granted.");
}

function maybeNotifyUnreadMessages(roomId, messages, firstLoad) {
  if (!("Notification" in window) || Notification.permission !== "granted" || firstLoad) return;
  if (!document.hidden && document.hasFocus()) return;

  let notified = notifiedMessageIdsByRoom.get(roomId);
  if (!notified) {
    notified = new Set();
    notifiedMessageIdsByRoom.set(roomId, notified);
  }

  messages.forEach((m) => {
    if (!m.id || notified.has(m.id) || m.sender === currentUser?.uid || m.deleted || isHiddenByBlock(m.sender)) return;
    notified.add(m.id);
    const title = activeRoom?.name || "New message";
    const body = `${m.senderName || userLabel(m.sender)}: ${m.text || (m.imageData ? "[Image]" : "New message")}`;
    const notification = new Notification(title, {
      body,
      icon: userPhoto(m.sender)
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  });
}

async function getBlockTargetUser() {
  const typedEmail = $("invite-email").value.trim();
  if (typedEmail) return findUserByEmail(typedEmail);

  const otherUid = getOtherDirectMember();
  if (!otherUid) {
    throw new Error("Enter a user's email, or select a direct chat first.");
  }

  let profile = knownUsers.get(otherUid);
  if (!profile) {
    const snap = await db.collection("users").doc(otherUid).get();
    if (!snap.exists) throw new Error("Cannot find that user profile.");
    profile = snap.data();
    knownUsers.set(otherUid, profile);
  }

  return { uid: otherUid, ...profile };
}

async function blockUserFromInput() {
  try {
    const friend = await getBlockTargetUser();
    if (friend.uid === currentUser.uid) throw new Error("You cannot block yourself.");

    await db.collection("users").doc(currentUser.uid).set({
      blockedUsers: FieldValue.arrayUnion(friend.uid),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    currentProfile.blockedUsers = Array.from(new Set([...(blockedUsersOf(currentProfile)), friend.uid]));
    knownUsers.set(currentUser.uid, currentProfile);

    updateChatInputState();
    renderMessages(false);

    if (isDirectRoom() && getOtherDirectMember() === friend.uid) {
      alert(`Blocked ${friend.username || friend.email}. This direct chat is now disabled.`);
    } else {
      alert(`Blocked ${friend.username || friend.email}. In group chats, your messages are mutually hidden.`);
    }
  } catch (e) {
    alert(e.message || e);
  }
}

async function unblockUserFromInput() {
  try {
    const friend = await getBlockTargetUser();

    await db.collection("users").doc(currentUser.uid).set({
      blockedUsers: FieldValue.arrayRemove(friend.uid),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    currentProfile.blockedUsers = blockedUsersOf(currentProfile).filter((uid) => uid !== friend.uid);
    knownUsers.set(currentUser.uid, currentProfile);

    updateChatInputState();
    renderMessages(false);
    alert(`Unblocked ${friend.username || friend.email}.`);
  } catch (e) {
    alert(e.message || e);
  }
}
