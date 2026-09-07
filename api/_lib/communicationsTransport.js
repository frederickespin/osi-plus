import { communicationFail } from "./communicationsContract.js";

export const COMMUNICATION_TRANSPORT_CAPABILITIES = Object.freeze({ EMAIL: false, WHATSAPP: false, PORTAL: false, SMS: false, INTERNAL: false });

export class DisabledCommunicationsTransport {
  readonly = true;
  capabilities = COMMUNICATION_TRANSPORT_CAPABILITIES;
  async dispatch() { communicationFail("COMMUNICATION_TRANSPORT_DISABLED", 409); }
}

export const communicationsTransport = Object.freeze(new DisabledCommunicationsTransport());
