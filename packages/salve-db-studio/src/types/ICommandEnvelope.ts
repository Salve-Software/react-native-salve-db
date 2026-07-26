/** Minimal shape every Studio command must have to be routed — the rest of its payload is opaque to the relay. */
export interface ICommandEnvelope {
  id?: unknown;
  type?: unknown;
}
