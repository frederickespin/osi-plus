import { createRoot } from "react-dom/client";
import { TemplateEditorModule } from "../../src/components/modules/TemplateEditorModule";
import { TemplatesCenterModule } from "../../src/components/modules/TemplatesCenterModule";
import "../../src/index.css";

const EDITOR_CONTEXT_KEY = "osi-plus.templates.editorContext";
const moduleName = new URLSearchParams(window.location.search).get("module");
const root = document.querySelector<HTMLElement>("#root");

if (!root) throw new Error("SEC_DEP_ROOT_MISSING");

const reactRoot = createRoot(root);

function renderEditor() {
  root.dataset.module = "editor";
  reactRoot.render(<TemplateEditorModule userRole="A" />);
}

if (moduleName === "editor") {
  localStorage.setItem(EDITOR_CONTEXT_KEY, JSON.stringify({
    templateType: "PIC",
    templateName: "SEC-DEP-01 fixture",
    returnModule: "k-templates",
  }));
  renderEditor();
} else if (moduleName === "center") {
  root.dataset.module = "center";
  window.addEventListener("changeModule", (event) => {
    if ((event as CustomEvent<string>).detail === "k-template-editor") renderEditor();
  });
  reactRoot.render(<TemplatesCenterModule userRole="A" />);
} else {
  root.textContent = "invalid module";
}
