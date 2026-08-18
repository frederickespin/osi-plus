import { CrmPipelineReadApi } from "/src/crm-relational/readApi";

let observedAbort = false;
const api = new CrmPipelineReadApi({
  tokenProvider: () => "synthetic.abort.token",
  fetchImpl: ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      observedAbort = true;
      reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  })) as typeof fetch,
});
const controller = new AbortController();
const pending = api.summary(controller.signal).catch((error: unknown) => error);
controller.abort(new DOMException("Harness unmounted", "AbortError"));
void pending.then(() => {
  document.body.dataset.result = observedAbort ? "aborted" : "not-aborted";
});
