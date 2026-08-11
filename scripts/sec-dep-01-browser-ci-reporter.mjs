const EXPECTED = Object.freeze({ chromium: 5, firefox: 5, webkit: 5 });

function projectName(test) {
  return test.parent.project()?.name ?? "unknown";
}

export default class SecDep01BrowserCiReporter {
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
    const configured = [...this.discovered.keys()].sort();
    const expectedProjects = Object.keys(EXPECTED).sort();
    if (JSON.stringify(configured) !== JSON.stringify(expectedProjects)) {
      errors.push(`projects=${configured.join(",") || "none"}`);
    }

    const projects = {};
    for (const [project, expected] of Object.entries(EXPECTED)) {
      const discovered = this.discovered.get(project) ?? 0;
      const executed = this.executed.get(project) ?? 0;
      const passed = this.passed.get(project) ?? 0;
      const skipped = this.skipped.get(project) ?? 0;
      projects[project] = { expected, discovered, executed, passed, skipped };
      if (discovered !== expected || executed !== expected || passed !== expected || skipped !== 0) {
        errors.push(`${project}=expected:${expected},discovered:${discovered},executed:${executed},passed:${passed},skipped:${skipped}`);
      }
    }

    const total = [...this.passed.values()].reduce((sum, value) => sum + value, 0);
    const summary = { ok: errors.length === 0 && result.status === "passed", total, projects };
    process.stdout.write(`[sec-dep-01-browser-validation] ${JSON.stringify(summary)}\n`);
    if (errors.length > 0) {
      process.stderr.write(`[sec-dep-01-browser-validation] FAIL ${errors.join("; ")}\n`);
      return { status: "failed" };
    }
  }
}
