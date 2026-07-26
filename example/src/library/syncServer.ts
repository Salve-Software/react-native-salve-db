import { Platform } from 'react-native';

// Real device: needs the Mac's LAN IP, not localhost/10.0.2.2 — edit this
// line locally. iOS Simulator reaches the host via localhost directly;
// Android emulator maps the host to 10.0.2.2, never localhost.
// Start the server first: `npm run dev -w salve-db-server` from the repo root.
export const SYNC_SERVER_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
