// Node 22 ships a global WebSocket. Without this, any test that calls
// Database.configure() would have StudioAgent dial the real dev server at
// ws://localhost:7377 and then reconnect-loop for the rest of the run.
// StudioAgent's own tests inject a fake socket, so nothing loses coverage.
delete globalThis.WebSocket;
