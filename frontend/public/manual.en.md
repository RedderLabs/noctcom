# Noctcom Manual

> Your private space. What you store here is yours and yours alone: it's encrypted on your own device before it ever leaves. Not even we can see it.

Welcome! This guide is meant to walk alongside you, not overwhelm you. Jump straight to whatever you need from the index below.

---

## Index

- [The essentials in 30 seconds](#the-essentials-in-30-seconds)
- [Creating your account and signing in](#creating-your-account-and-signing-in)
- [Your files, your way](#your-files-your-way)
- [Your security, without the hassle](#your-security-without-the-hassle)
- [Your space](#your-space)
- [Use the disks on your own computer](#use-the-disks-on-your-own-computer)
- [Run it on your own server (advanced)](#run-it-on-your-own-server-advanced)
- [Make it comfortable for you](#make-it-comfortable-for-you)
- [Quick shortcuts](#quick-shortcuts)
- [Stuck? We're here](#stuck-we-re-here)

---

## The essentials in 30 seconds

- **You hold the key.** Your files are encrypted in your browser with your master password. They travel already locked; the server only stores things it cannot open.
- **So take good care of it.** If you lose both your password **and** your recovery phrase, nobody can get your files back. It's not that we don't want to — we technically can't. That's exactly the point.
- **Save your recovery phrase.** It's 12 words. Write them down on paper or in your password manager. It's your lifeline if you ever forget your password.

---

## Creating your account and signing in

### Creating your account

1. Click **Create account** on the home page.
2. Pick a username and enter your email.
3. Create a strong **master password**. The longer, the better: at least 12 characters, mixing numbers and symbols. It's the key to everything, so it's worth thinking it through.
4. We'll give you a 12-word **recovery phrase**. Keep it somewhere safe (paper or a password manager). Think of it as the spare key to your house.
5. We'll ask you for 3 of those words at random, just to make sure you really saved it.
6. Done! Your space is created automatically.

> One important reminder, said with care: if you lose both your password and your recovery phrase, your data is gone forever. There's no magic button and no support team that can rescue it. Keep them safe and you'll sleep easy.

### Signing in

1. Type your email and your master password.
2. Your password is checked **on your own device** and is never sent to our servers.
3. If you've enabled two-step verification, we'll also ask for a quick code.
4. Prefer your fingerprint or your face? You can also sign in with a Passkey.

### Your first time inside

The first time you enter your vault, a small welcome tour will greet you: five short steps covering what matters (what the encryption means, why your 12-word phrase is so valuable, how to upload your first file, and how to turn on two-step verification). You can skip it whenever you like — it won't come back.

---

## Your files, your way

### Your files

Everything lives here. It's your main folder.

- **Create a folder:** click "New folder" (or "New" in the sidebar). You can give it an icon and a color to spot it at a glance.
- **Upload things:** click "Upload files" or, even easier, drag files from your desktop and drop them into the window.
- **Organize:** drag a file or folder onto another one to move it. Just like on your everyday computer.
- **See it your way:** switch between grid and list with the buttons at the top.

### Opening and previewing

Click any file to view it without leaving Noctcom. We open it by decrypting it **in your browser**, on the spot, without sending it anywhere.

| Type | What you can open | How it looks |
|------|---------------------|---------------|
| **Images** | PNG, JPG, GIF, SVG, WebP, BMP, ICO | Viewer with zoom (mouse wheel or +/- buttons) |
| **Video** | MP4, WebM, OGG, MOV | Regular player, with its controls |
| **Audio** | MP3, WAV, OGG, FLAC, AAC, WebM | Regular player, with its controls |
| **PDF** | PDF | Opens right inside the page |
| **Text and code** | TXT, MD, JSON, JS, TS, CSS, HTML, PY, and many more | With line numbers, easy to read |
| **Office** | DOCX, XLSX, PPTX and similar | Downloaded (the browser can't display them) |

A couple of practical details:

- Very large files (over 50 MB) warn you before opening, because decrypting them uses your device's memory.
- Huge text files (over 5 MB) are shown trimmed so your browser doesn't choke.

### Finding something fast

Press `Ctrl+K` (or `⌘K` on Mac) and search by name. The search happens on your device: we never see what you're looking for.

### Recent, Starred and friends

- **Recent:** the last things you opened or touched, in case you want to go back.
- **Starred:** mark what you use often with the star and you'll always have it at hand.
- **Shared:** what you share with other people, and what they share with you. Only the recipient can open it.
- **Activity:** a diary of what's happened in your account (uploads, downloads, sign-ins…). Handy for keeping everything under control.
- **Trash:** what you delete stays here for 30 days in case you change your mind. You can restore it or empty it for good. Even in the trash, it stays encrypted.

---

## Your security, without the hassle

Noctcom is built to protect you by default. These options give you extra peace of mind.

### The lock on your files

Everything is locked in your browser **before** it's uploaded. The server only sees closed boxes: neither we, nor anyone looking at the server, can read what's inside. For those who enjoy the technical detail: we use XChaCha20-Poly1305 encryption and derive your key with Argon2id; file and folder names are encrypted too.

### Two-step verification (email code)

A second lock on your account. Even if someone knew your password, they couldn't get in without this step. Turn it on in **Settings > Security > Email code**:

1. Enable the option (your email needs to be verified).
2. From then on, every time you sign in we'll send a **6-digit code** to your email.
3. Type it in to complete the sign-in. It expires in 10 minutes.

> For maximum convenience and security, combine it with a **Passkey** (fingerprint or face): you get in fast, with double protection.

### Signing in with your fingerprint or face (Passkeys)

If you'd rather not type, set up a Passkey:

1. Go to **Settings > Security > Passkeys**.
2. Click "Set up".
3. Follow what your browser or phone tells you. From then on, you sign in with your fingerprint or Face ID.

### Changing your master password

In **Settings > Security > Change master password**. Don't worry: your files are automatically re-locked with the new key, and your open sessions keep working.

### Recovering your account with the 12-word phrase

Forgot your password? That's what you saved your 12 words for:

1. On the sign-in screen, click **Forgot your password?**
2. Enter your email.
3. Type the 12 words in order (you can paste them all at once).
4. Choose a new master password.
5. For safety, we close your old sessions and re-encrypt your keys.

With your recovery phrase you don't just get your **access** back: your **files** stay with you too, re-encrypted under your new password. That's why keeping it safe matters so much.

> If you created your account a while ago, make sure your recovery kit is up to date in **Settings > Security > Recovery kit** (there you can verify or regenerate your phrase).

### Your devices

In **Settings > Devices** you can see where your sessions are open. If something looks off, or you used a borrowed computer, you can close that session remotely.

### Alerts when someone shares with you

In **Settings > Notifications** you can turn on browser alerts to know when someone shares a file with you, even with the tab closed. The alert is generic (never the file name — that's encrypted). You turn it on yourself, on purpose; it never asks on its own.

---

## Your space

Every new account starts with a **30-day trial with 10 GB**, encrypted like everything else. In the sidebar you can see how much you've used and a **countdown** with the trial days you have left; in **Settings > Plan and usage** you have your current plan with the usage bar (and in **Settings > Storage**, the breakdown by file type).

### When the trial ends

Your account **stays free forever**, with 1 GB of space. **We delete nothing**: your files are still there and you can download them anytime. That said, if you're using more than 1 GB when it ends, you won't be able to upload anything new until you free up space or upgrade.

### Growing your space

Running out of room? Upgrade whenever you like from **Settings > Plan and usage > Upgrade plan**. A window opens, without leaving the app, with the available plans:

| Plan | Space | Price |
|------|---------|--------|
| Free | 1 GB | €0 |
| Starter | 10 GB | €1 / month |
| Plus | 50 GB | €2 / month |
| Pro | 200 GB | €5 / month |
| Max | 1 TB | €10 / month |

Things worth knowing, with no fine print:

- **Same encryption on every plan.** You pay for space, never for your privacy.
- **Payments are handled by Stripe.** Noctcom never sees your card details.
- **Changing plans:** instant and prorated (you only pay the difference).
- **Cancelling:** from the **Manage** button. You keep your plan until the end of the period you already paid; we'll email you the exact date you go back to the Free plan. **We delete nothing:** if you're over quota when you return to 1 GB, your account goes read-only (you can download and export) until you free up space or reactivate a plan.
- **Any paid plan unlocks the Noctcom Connector** (see below) to use your own disks.
- **Self-hosting is always free** (see below): same encryption, unlimited capacity, on your own server.

---

## Use the disks on your own computer

Got a hard drive or SSD at home with room to spare? You can use it as storage for Noctcom.

Here's a technical truth worth knowing: a web page **cannot touch your computer's disks** on its own (your browser forbids it — thankfully, for your safety). That's why there's a small program, the **Noctcom Connector**, that acts as a trusted bridge between your computer and the web.

What matters to you:

- **It opens no doors into your computer.** It's the one that calls out, never the other way around. Nothing is left exposed.
- **It only handles closed boxes.** Your keys never leave your machine; the program only moves data that's already encrypted.
- **It's yours alone.** It's tied to your account. Nobody else can see or touch your disks.

> For now it's available for **Windows**. Mac and Linux versions are coming soon.

> On Noctcom's cloud, the Connector unlocks with **any paid plan** (from €1/month). If you cancel your plan, your agents are unlinked — your files stay on your disks, nothing is deleted. On **self-host** the Connector is always available, no plans involved.

### 1. Download it

Go to **Settings > Noctcom Connector** and click **Download for Windows**. It's a single file (`noctcom-connector.exe`) and there's nothing to install.

> The first time, Windows may show an "unknown publisher" warning. That's normal (the program doesn't have an official signature yet). Click **More info** and then **Run anyway**. It's safe: it's built from the project's open-source code.

### 2. Link it to your account

1. In **Settings > Noctcom Connector**, click **Pair agent** and give it a name (for example, "Living room PC"). We'll give you a **code** that lasts 10 minutes.
2. Open a terminal **in the folder where the file was downloaded** (usually Downloads). Quick trick: inside that folder, type `cmd` in the File Explorer address bar and press Enter.
3. Type this, pasting your code:

```text
.\noctcom-connector.exe pair --code YOUR_CODE
```

### 3. Leave it running

```text
.\noctcom-connector.exe run
```

Keep that window open while you want to manage your disks from the web. (In a future version it will run on its own, in the background, with no terminal.)

### 4. See your disks and pick one

Go back to **Settings > Noctcom Connector** and reload the page: your computer will show up **online** with its disks (C:, D:, that USB you plugged in…), their free space and more.

On each disk you'll see a **Use this disk** button. When you click it, Noctcom creates a folder (`noctcom-blobs`) inside that disk to store your encrypted files there. **It doesn't format or erase anything**: whatever you had stays intact. If you change your mind, **Stop using** unregisters it without touching your data.

### Commands, in case you need them

| Type this | And it does… |
| --- | --- |
| `.\noctcom-connector.exe status` | Tells you if it's linked to your account |
| `.\noctcom-connector.exe pair --code CODE` | Links it to your account (first time only) |
| `.\noctcom-connector.exe run` | Starts it up (leave the window open) |
| `.\noctcom-connector.exe --help` | Lists everything it can do |

> Your files already travel encrypted all the way to that disk through the program, and you can format empty disks from the web (with double confirmation). Coming soon: macOS and Linux versions, and running in the background without a terminal.

---

## Run it on your own server (advanced)

Noctcom is 100% open source (AGPL-3.0 license). If you're comfortable with tech, you can run it on your own server.

**The fast way — a single command.** It downloads the installer, asks for your domain, generates the passwords for you and starts everything. With a domain you get the automatic HTTPS padlock; without one it works just as well on your local network (`http://<server-IP>`):

```bash
curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/install.sh | bash
```

**Using Proxmox?** This command (as root, on the Proxmox host) creates an LXC container and gets everything running inside:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/proxmox/noctcom-lxc.sh)
```

**By hand**, if you prefer to control every step:

```bash
git clone https://github.com/RedderLabs/noctcom.git
cd noctcom
cp .env.example .env
# Edit .env with your passwords and your domain
docker compose up -d
```

### What you need

- Docker and Docker Compose (or a Proxmox VE host if you go the LXC route).
- At least 2 GB of RAM (part of it is used by the encryption).
- A domain pointing to your server for the automatic HTTPS padlock — optional: without a domain it works on your local network by IP, without the padlock.

### Adding more disks to your server

Noctcom finds the disks you mount on the server by itself. From **Settings > Storage** you can see them, activate them with one click and, if needed, prepare them.

1. Plug in a disk or mount a partition on your server.
2. Noctcom detects it automatically.
3. It shows up in the storage section.
4. You activate it with one click and it counts as extra space.

Which disk format to use? A quick guide:

| Format | Good for | Keep in mind |
|---------|-----------------|-------------|
| **ext4** | Linux (the most common) | Not readable on Windows without extras |
| **XFS** | Linux with very large files | Similar to ext4, smooth with huge volumes |
| **NTFS** | Windows | Works on Linux, but slower |
| **FAT32** | Better to avoid | No files over 4 GB |
| **exFAT** | USB drives across systems | More prone to corruption |

**In short:** if it's Linux, ext4 and off you go. If your disk comes in another format, Noctcom will offer to prepare it (warning you before erasing anything).

---

## Make it comfortable for you

### Bigger or smaller text

Use the text size buttons (A, A+, A++). They're in the sidebar when you're inside, and in the top bar on the sign-in screens. Your preference is saved automatically.

### Light or dark theme

Click the theme button (sun/moon), next to the text size and language buttons. If you don't choose, Noctcom respects your system setting. Your preference is remembered.

### Spanish or English

Click the language switcher (ES/EN) to flip the whole site and app between Spanish and English. English lives under `/en` (for example `noctcom.com/en`); Spanish keeps the original addresses.

### Collapsible sidebar

Click the collapse button at the top of the sidebar to leave it in "icons only" mode. Great on small screens or if you use large text.

---

## Quick shortcuts

| Shortcut | What for |
|-------|--------|
| `Ctrl+K` / `⌘K` | Search your account |

---

## Stuck? We're here

- **Noctcom's code:** [github.com/RedderLabs/noctcom](https://github.com/RedderLabs/noctcom)
- **Something's wrong?** Tell us on [GitHub Issues](https://github.com/RedderLabs/noctcom/issues)
- **Spotted a security flaw?** See how to report it in [SECURITY.md](https://github.com/RedderLabs/noctcom/blob/main/SECURITY.md)

---

*Last updated: v0.13.0 · June 5, 2026*
