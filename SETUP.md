# Setting up CD Wallet

A step-by-step guide for macOS and Windows, from a new AWS account to your music playing on your phone. It assumes you have never used AWS or a command line for development before. If you already have some of these tools, skip those steps.

You will end up with:

1. An AWS account of your own, with a safe way for your computer to sign in to it
2. Four small tools installed: Node.js, pnpm, the AWS command line, and (optionally) Git
3. CD Wallet deployed into your account
4. Your music uploaded, and your phone paired

Expect about 30 to 45 minutes, plus upload time for your library. Everything you create can be removed again (see [Removing it](README.md#removing-it)).

**Where you type commands:** on macOS, open **Terminal** (press Cmd+Space, type "Terminal"). On Windows, open **PowerShell** (press the Windows key, type "PowerShell"). The commands below are marked for each system where they differ.

## 1. Create your AWS account

1. Go to <https://aws.amazon.com> and choose **Create an AWS account**. You need an email address, a credit card and a phone number. AWS will tell you when the account is ready; sometimes that takes a few minutes, occasionally up to a day.
2. Sign in to the [AWS console](https://console.aws.amazon.com) with the email and password you just chose. This is the **root user**. It can do anything, so you will use it only to set up a safer sign-in, then put it away.
3. Turn on multi-factor authentication for the root user: open the account menu (your name, top right), choose **Security credentials**, then **Assign MFA device**, and follow the prompts with an authenticator app.

### Create a sign-in for your computer

Rather than create long-lived access keys that can leak, use AWS's browser sign-in (`aws login`), which hands your computer temporary credentials. You need an **IAM user** for it:

1. In the console, open **IAM**, then **Users**, then **Create user**. Give it any name, such as `cdwallet-admin`. Leave "Provide user access to the AWS Management Console" ticked and set a password.
2. On the permissions step, choose **Attach policies directly** and tick both:
   - `AdministratorAccess` (CD Wallet's one-time setup creates roles and a storage bucket, so it needs broad rights)
   - `SignInLocalDevelopmentAccess` (lets this user use `aws login`)
3. Finish creating the user, then note the **console sign-in URL** shown for it (it looks like `https://123456789012.signin.aws.amazon.com/console`).
4. Sign out of the root user, sign in at that URL as the new user, and turn on MFA for it too.

From now on, use this user, not root.

> Using the root user directly with `aws login` also works and skips the steps above, but it is not recommended: a mistake or a stolen session then has no limits.

## 2. Install the tools

You need **Node.js 22 or newer**, **pnpm**, and the **AWS CLI version 2.32 or newer** (older versions do not have `aws login`). Git is optional.

### macOS

1. **Node.js:** download the LTS installer from <https://nodejs.org> and run it. Check it worked in Terminal:
   ```sh
   node --version
   ```
   It should print `v22` or higher.
2. **pnpm:**
   ```sh
   curl -fsSL https://get.pnpm.io/install.sh | sh -
   ```
   Then **close and reopen Terminal** and check with `pnpm --version`.
3. **AWS CLI:** download the macOS installer from <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html> (choose "macOS" and the graphical installer) and run it. Check with `aws --version`.
4. **Git (optional):** run `git --version`. If Git is missing, macOS offers to install it. You can also skip Git and download a ZIP in the next section.

### Windows

1. **Node.js:** download the LTS installer from <https://nodejs.org> and run it, keeping the defaults. Open a new PowerShell window and check:
   ```powershell
   node --version
   ```
   It should print `v22` or higher.
2. **pnpm:**
   ```powershell
   iwr https://get.pnpm.io/install.ps1 -useb | iex
   ```
   Then **close and reopen PowerShell** and check with `pnpm --version`. Use this installer rather than `npm install -g pnpm`; CD Wallet needs to start `pnpm` itself and the standalone version works most reliably on Windows.
3. **AWS CLI:** download the 64-bit MSI installer from <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html> (choose "Windows") and run it. Open a new PowerShell window and check with `aws --version`.
4. **Git (optional):** install from <https://git-scm.com/download/win>, or skip Git and download a ZIP in the next section.

## 3. Get CD Wallet

With Git:

```sh
git clone https://github.com/mikemcdevitt/cd-wallet.git
cd cd-wallet
```

Without Git: open <https://github.com/mikemcdevitt/cd-wallet>, choose **Code**, then **Download ZIP**, unzip it, and in Terminal or PowerShell change into the unzipped folder with `cd` (for example `cd ~/Downloads/cd-wallet-main` on macOS, or `cd $HOME\Downloads\cd-wallet-main` on Windows).

Then install its dependencies. This takes a few minutes the first time:

```sh
pnpm install
```

## 4. Sign in to AWS

Use the same command on both systems:

```sh
aws login --profile cdwallet
```

The CLI asks for a region (press Enter to accept `us-east-1`, which the cost figures in the README use; any region works), opens your browser, and asks you to sign in as the IAM user from step 1. When it says you're signed in, check:

```sh
aws sts get-caller-identity --profile cdwallet
```

You should see your account number and the user's name.

The sign-in lasts up to 12 hours. If a later command says your credentials are missing or expired, run `aws login --profile cdwallet` again. If you are on a computer with no browser, or are working over a remote connection, add `--remote` to the login command.

## 5. Deploy

```sh
pnpm cdwallet deploy --profile cdwallet
```

It shows which account and region it will use and what it is about to create, and asks you to confirm. It also asks for an email address for monthly budget alerts; give one, because an alert is the only warning you will get about spending. The first deploy also does AWS's one-time CDK setup in your account, so it takes a few minutes longer than later ones.

When it finishes, it saves your settings (including the admin token that allows adding and removing music) in a private file in your home folder under `.cdwallet`. Keep that private.

## 6. Import your music

Point the importer at the folder that holds your music. It reads MP3 and M4A files, skips anything else, and is safe to run again: files already uploaded are skipped.

macOS:

```sh
pnpm cdwallet import ~/Music
```

Windows:

```powershell
pnpm cdwallet import "$HOME\Music"
```

Where your music lives depends on how you collected it:

| If you use | The folder is usually |
| --- | --- |
| Apple Music on macOS | `~/Music/Music/Media/Music` |
| iTunes on Windows | `$HOME\Music\iTunes\iTunes Media\Music` |
| Ripped CDs or downloads | wherever you saved them |

A big library takes a while to upload, depending on your internet connection. If it stops partway (closed laptop, lost connection, expired sign-in), sign in again if needed and run the same command; it picks up where it left off.

## 7. Pair your phone

1. Install the Android app from the [releases page](https://github.com/mikemcdevitt/cd-wallet/releases/latest) (see [Install the Android app](README.md#install-the-android-app)).
2. Run:
   ```sh
   pnpm cdwallet pair
   ```
3. Scan the QR code in the app. Your library appears and you can start playing.

## If something goes wrong

- **`aws: command not found` or `pnpm` is not recognized:** close and reopen Terminal or PowerShell. If it still fails, the installer did not finish or the tool is not on your path; run it again.
- **`aws login` is not a command:** your AWS CLI is older than 2.32. Run `aws --version`, and install the current version from the link in step 2.
- **"AuthorizationError" or access denied during `aws login`:** the IAM user is missing the `SignInLocalDevelopmentAccess` policy.
- **`OptInRequired` or "service not subscribed" errors:** AWS has not finished activating the account. Open the console and complete any "Complete your AWS registration" prompt. Check that the payment method on the account is valid and not expired, then wait a little and retry.
- **"Several deployments are saved":** add `--name <name>` to say which one you mean.
- **Your credentials expired during a long import:** run `aws login --profile cdwallet`, then re-run the import.

If you are stuck, [open an issue](https://github.com/mikemcdevitt/cd-wallet/issues) and say which system you are on and what the last command printed. Don't paste tokens or the contents of your `.cdwallet` folder.
