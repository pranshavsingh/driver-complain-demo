# mobile

The **driver app** — Expo + React Native + TypeScript. A driver signs in with Employee ID and
PIN, sees the vehicle assigned to them, reports a problem with a photo, follows their own
complaints, and gets a push notification when an admin changes a status.

Designed for one user in one situation: a non-technical driver, outdoors, one-handed, on a weak
3G signal. That drives most of the decisions below — 48dp touch targets, no icon-only controls,
compressed uploads, and errors that say what to do next.

## Running it

```bash
cp .env.example .env          # then set EXPO_PUBLIC_API_URL to your machine's LAN IP
pnpm install                  # from the repo root
pnpm --filter @driver-complaint/mobile start:dev-client
```

**Expo Go will not work.** `@react-native-firebase/messaging` is a native module, so the app
needs a **development build**:

```bash
cd apps/mobile
npx eas build --profile development --platform android
```

Install that APK on the phone once, then `start:dev-client` connects to it. Everything except
push also runs in a plain `expo run:android` local build if you have Android Studio.

`localhost` on a phone means _the phone_. Use the LAN IP of the machine running the API
(`http://192.168.x.x:4000`), or `http://10.0.2.2:4000` on an Android emulator. Nothing needs to
be added to the API's `CORS_ORIGINS`: React Native `fetch` sends no `Origin` header, so CORS
never applies to this app — only the dashboard needs it.

## Scripts

| Script             | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `start`            | Metro dev server                                     |
| `start:dev-client` | Metro, targeting an installed development build      |
| `android` / `ios`  | `expo run:*` — local native build + install          |
| `prebuild`         | Regenerate `android/` + `ios/` from the app config   |
| `bundle`           | `expo export --platform android` → `dist/` (CI gate) |
| `doctor`           | `npx expo-doctor` — config/dependency sanity checks  |
| `typecheck`        | `tsc --noEmit`                                       |
| `lint`             | ESLint (root flat config + react-hooks rules)        |

`bundle` is the closest thing to a build here: it runs the real Metro bundler over every screen,
so an import that only breaks at bundle time fails a command instead of failing on a driver's
phone.

## Environment

```
EXPO_PUBLIC_API_URL=http://localhost:4000
# GOOGLE_SERVICES_JSON=./google-services.json
# GOOGLE_SERVICES_PLIST=./GoogleService-Info.plist
```

**Every `EXPO_PUBLIC_` variable is inlined into the JavaScript bundle and is therefore public** —
anyone who unzips the APK can read it. Never put a secret here. `src/config/env.ts` validates it
with zod at module load, so a misconfigured build fails on the first screen instead of firing
requests at `undefined/api/v1`.

For an EAS build, set `EXPO_PUBLIC_API_URL` as an environment variable on the build profile.
`app.config.ts` **throws** if it is missing during an EAS build, because that combination
produces an installable app that can never reach the API.

## Structure

```
app/                      expo-router file routes
  _layout.tsx             providers, Stack, ErrorBoundary
  login.tsx
  (app)/_layout.tsx       auth gate + push wiring
  (app)/index.tsx         home: vehicle + my complaints
  (app)/new.tsx           report a problem
  (app)/complaint/[id].tsx
  +not-found.tsx
src/
  api/        client.ts (fetch + auth + refresh), endpoints.ts, tokens.ts
  auth/       AuthContext.tsx
  push/       messaging.ts (FCM wrapper), registration.ts (device tokens)
  components/ Button, TextField, Card, Badges, Header, ErrorNotice, ScreenState, PushBanner
  hooks/      useApiResource
  lib/        format.ts
  config/     env.ts
```

Native headers are off app-wide in favour of `components/Header.tsx`. The stock back chevron is
a ~24dp icon with no label; this one is a 48dp target that says **Back**, which is what a gloved
thumb and a non-technical user both need.

## How auth works

- **Access token in memory** — dropped when the app is killed, never written to disk.
- **Refresh token in `expo-secure-store`** (Android Keystore / iOS Keychain), encrypted at rest
  and unreadable by other apps. This is why a driver signs in once, not every morning.
- On any `401`, the fetch wrapper refreshes once and replays the request. The refresh is
  **single-flight**: the API rotates refresh tokens and treats reuse as theft, so two parallel
  refreshes would revoke the whole family and sign the driver out.
- Logout deletes the stored token _and_ de-registers this device's push token. On a shared or
  handed-back phone, skipping that would send the next holder pushes about someone else's
  complaints.
- `app/(app)/_layout.tsx` redirects to `/login` when there is no session. That is **UX, not
  security** — every endpoint behind it runs its own `authenticate` + role check, so a bypassed
  gate yields 401s and 403s, not data.

## Push notifications

`src/push/messaging.ts` is a runtime-gated wrapper around `@react-native-firebase/messaging`.
The JS is always in the bundle, but the **native** module only exists in a build made with the
Firebase config plugins, and touching a missing native module throws — so the package is loaded
through a guarded `require` and every entry point degrades to a no-op.

The gate is driven by the credential paths, in `app.config.ts`:

- `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICES_PLIST` set → the `@react-native-firebase/app` and
  `/messaging` config plugins are added and `googleServicesFile` is pointed at them.
- Neither set → the plugins are left out. **The app builds, bundles and runs with push simply
  off**, matching how the API gates FCM, Cloudinary and Sentry.

Those two files come from your Firebase console, are per-environment, and are gitignored. They
are not credentials in the signing sense — they ship inside the binary — but they are not ours
to commit.

Once configured, on every authenticated launch the app requests permission, registers the FCM
token with `POST /notifications/devices`, and re-registers whenever FCM rotates it. Android 13+
needs the `POST_NOTIFICATIONS` runtime permission, and RNFirebase's `requestPermission()` is a
no-op that reports AUTHORIZED there, so Android goes through `PermissionsAndroid` instead.

Three delivery cases:

| App state  | What happens                                                            |
| ---------- | ----------------------------------------------------------------------- |
| Foreground | The OS draws nothing, so the app shows its own banner (tap → complaint) |
| Background | OS notification; tapping it opens the complaint                         |
| Quit       | OS notification; the launch notification is read once and navigated to  |

Background and quit-state display need no JS handler because the API sends a `notification`
block in every message. A data-only push would need `setBackgroundMessageHandler`; none is sent.

**Push is a convenience, never the only channel.** A driver who declines notifications, has no
Play Services, or is on a build with no Firebase still sees every status change by opening the
app — the durable `Notification` rows and the complaint itself are the record of truth.

## Photos

`expo-image-picker`, camera or gallery, one photo per complaint, uploaded as multipart on the
same `POST /complaints` request. Quality is fixed at `0.5` and anything over **10 MB** (the
API's multer limit) is refused before the upload starts — on rural 3G that turns a two-minute
upload ending in a 413 into an instant, readable message.

## Deploying (EAS)

```bash
cd apps/mobile
npx eas build --profile preview --platform android    # internal APK for testers
npx eas build --profile production --platform android  # store app-bundle
```

Profiles are in `eas.json`: `development` (dev client), `preview` (internal APK), `production`
(app-bundle, `autoIncrement`). Per profile you need `EXPO_PUBLIC_API_URL` and — for push — the
two Firebase files uploaded as EAS file secrets, which arrive as those same env vars.

Versioning is `appVersionSource: "local"`: `version` and `android.versionCode` in `app.json` are
the source of truth, so a release is a reviewable diff rather than remote state.

## Not implemented here

- **Offline queueing.** A complaint filed with no signal fails and must be retried by hand. The
  form keeps its contents on failure so retrying costs a tap, but nothing is stored for later. A
  real fix needs a local queue plus server-side idempotency.
- **No idempotency key on `POST /complaints`.** The Send button disables itself while a request
  is in flight, which narrows the double-submit window but does not close it: a driver who taps
  twice on a stalling connection can still file the same fault twice. Closing it needs a
  client-generated key that the API stores and de-duplicates on.
- **Editing or deleting a complaint.** Deliberate — the complaint list is an audit trail.
- **iOS store configuration.** `ios` keys exist in `app.json` and the code is
  platform-neutral, but nothing has been built or tested on iOS. `requestPermission` there uses
  an API RNFirebase has deprecated; revisit when iOS actually ships.
- **Notification centre UI** (`GET /notifications` exists and is unused here) and admin
  features of any kind.
- **Automated tests.** Verified by typecheck, lint and a real Metro bundle; every runtime check
  is manual, on a device. See the phase report.

## Known dependency warnings

`pnpm install` reports two unmet peers, both harmless and both caused by
`auto-install-peers=true` picking the newest version that satisfies the widest range:

- `react-native-worklets` 0.12.1 vs a `^0.10.0` peer range — wanted by
  `react-native-reanimated` / `@expo/ui`, which reach the tree only through expo-router's
  optional Drawer and UI modules. This app uses `Stack` and neither of those.
- `@react-native/metro-config` 0.87.0 vs a `0.86.2` peer — wanted by
  `@react-native/community-cli-plugin`. `metro.config.js` uses `expo/metro-config`.

`expo-doctor` passes 21/21 with `typescript` excluded in `package.json`: SDK 57 wants
TypeScript ~6.0.3 and this monorepo pins `^5` in four packages. 5.9.3 compiles the app clean, so
the bump is a repo-wide decision for later rather than a per-app divergence.
