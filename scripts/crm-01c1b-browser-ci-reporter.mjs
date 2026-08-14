const EXPECTED_PROJECTS = Object.freeze([
  "chromium-desktop", "firefox-desktop", "webkit-desktop",
  "chromium-mobile", "firefox-mobile", "webkit-mobile",
]);
const EXPECTED_PER_PROJECT = 3;

export default class Crm01c1bBrowserCiReporter {
  constructor() {
    this.counts = new Map();
    this.failures = [];
  }

  onTestEnd(test, result) {
    const project = test.parent.project()?.name;
    if (!project) return;
    if (result.status === "passed") this.counts.set(project, (this.counts.get(project) ?? 0) + 1);
    else this.failures.push(`${project}:${test.title}:${result.status}`);
  }

  onEnd() {
    const errors = [...this.failures];
    for (const project of EXPECTED_PROJECTS) {
      const count = this.counts.get(project) ?? 0;
      if (count !== EXPECTED_PER_PROJECT) errors.push(`${project}=${count}/${EXPECTED_PER_PROJECT}`);
    }
    for (const project of this.counts.keys()) {
      if (!EXPECTED_PROJECTS.includes(project)) errors.push(`proyecto inesperado:${project}`);
    }
    const total = [...this.counts.values()].reduce((sum, count) => sum + count, 0);
    process.stdout.write(`[crm-01c1b-browser-validation] ${JSON.stringify({ total, expected: 18, projects: Object.fromEntries(this.counts) })}\n`);
    if (errors.length) {
      process.stderr.write(`[crm-01c1b-browser-validation] FAIL ${errors.join("; ")}\n`);
      process.exitCode = 1;
    }
  }
}
