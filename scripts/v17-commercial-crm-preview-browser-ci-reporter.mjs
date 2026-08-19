const EXPECTED_PROJECTS = Object.freeze([
  "chromium-desktop",
  "chromium-mobile",
  "firefox-desktop",
  "firefox-mobile",
  "webkit-desktop",
  "webkit-mobile",
]);
const EXPECTED_PER_PROJECT = 4;
const EXPECTED_TOTAL = 24;

function projectName(test) {
  return test.parent.project()?.name ?? "unknown";
}

export default class V17CommercialCrmPreviewBrowserCiReporter {
  discovered = new Map();
  executed = new Map();
  passed = new Map();
  skipped = new Map();

  printsToStdio() {
    return false;
  }

  onBegin(config, suite) {
    for (const project of config.projects) this.discovered.set(project.name, 0);
    for (const test of suite.allTests()) {
      const project = projectName(test);
      this.discovered.set(project, (this.discovered.get(project) ?? 0) + 1);
    }
  }

  onTestEnd(test, result) {
    const project = projectName(test);
    this.executed.set(project, (this.executed.get(project) ?? 0) + 1);
    if (result.status === "passed" && test.expectedStatus === "passed") {
      this.passed.set(project, (this.passed.get(project) ?? 0) + 1);
    }
    if (result.status === "skipped" || test.expectedStatus === "skipped") {
      this.skipped.set(project, (this.skipped.get(project) ?? 0) + 1);
    }
  }

  onEnd(result) {
    const errors = [];
    if (result.status !== "passed") errors.push(`runStatus=${result.status}`);
    const configured = [...this.discovered.keys()].sort();
    if (JSON.stringify(configured) !== JSON.stringify([...EXPECTED_PROJECTS].sort())) {
      errors.push(`projects=${configured.join(",") || "none"}`);
    }

    const projects = {};
    for (const project of EXPECTED_PROJECTS) {
      const discovered = this.discovered.get(project) ?? 0;
      const executed = this.executed.get(project) ?? 0;
      const passed = this.passed.get(project) ?? 0;
      const skipped = this.skipped.get(project) ?? 0;
      projects[project] = { expected: EXPECTED_PER_PROJECT, discovered, executed, passed, skipped };
      if (discovered !== EXPECTED_PER_PROJECT || executed !== EXPECTED_PER_PROJECT
        || passed !== EXPECTED_PER_PROJECT || skipped !== 0) {
        errors.push(`${project}=expected:${EXPECTED_PER_PROJECT},discovered:${discovered},executed:${executed},passed:${passed},skipped:${skipped}`);
      }
    }

    const total = [...this.passed.values()].reduce((sum, value) => sum + value, 0);
    if (total !== EXPECTED_TOTAL) errors.push(`total=${total},expected:${EXPECTED_TOTAL}`);
    const summary = { ok: errors.length === 0, total, projects };
    process.stdout.write(`[v17-commercial-crm-preview-browser-validation] ${JSON.stringify(summary)}\n`);
    if (errors.length > 0) {
      process.stderr.write(`[v17-commercial-crm-preview-browser-validation] FAIL ${errors.join("; ")}\n`);
      return { status: "failed" };
    }
  }
}
