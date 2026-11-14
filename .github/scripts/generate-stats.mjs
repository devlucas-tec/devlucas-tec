// Gera os cards "GitHub Stats" e "Activity Graph" como SVG, usando a API GraphQL do GitHub.
// Uso: GITHUB_TOKEN=... node generate-stats.mjs <usuario> <pasta-de-saida>
// Para testar sem rede: STATS_FIXTURE=dados.json node generate-stats.mjs <usuario> <pasta>
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [login, outDir = "dist"] = process.argv.slice(2);
if (!login) throw new Error("Informe o usuário: node generate-stats.mjs <usuario> [pasta]");

const theme = {
  bg: "#1a1b27",
  border: "#2a2e3f",
  title: "#7aa2f7",
  text: "#a9b1d6",
  value: "#c0caf5",
  icon: "#bb9af7",
  line: "#7aa2f7",
  point: "#bb9af7",
  grid: "#2a2e3f",
};

const query = `
query($login: String!) {
  user(login: $login) {
    name
    login
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositoriesContributedTo(contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]) { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
      totalCount
      nodes { stargazerCount }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

async function fetchUser() {
  if (process.env.STATS_FIXTURE) {
    return JSON.parse(await readFile(process.env.STATS_FIXTURE, "utf8")).data.user;
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN não definido");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "readme-stats-action",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`Erro na API do GitHub: ${JSON.stringify(json.errors ?? json)}`);
  return json.data.user;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (n) => new Intl.NumberFormat("pt-BR").format(n);

// Ícones (octicons, 16x16)
const icons = {
  star: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
  commit: "M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  pr: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z",
  issue: "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
  repo: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z",
  calendar: "M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z",
};

function statsCard(user) {
  const c = user.contributionsCollection;
  const stars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
  const rows = [
    ["star", "Total de estrelas", stars],
    ["commit", `Commits (último ano)`, c.totalCommitContributions + c.restrictedContributionsCount],
    ["calendar", "Contribuições (último ano)", c.contributionCalendar.totalContributions],
    ["pr", "Pull requests", user.pullRequests.totalCount],
    ["issue", "Issues", user.issues.totalCount],
    ["repo", "Repositórios públicos", user.repositories.totalCount],
  ];
  const width = 450;
  const height = 70 + rows.length * 28 + 10;
  const title = `Estatísticas de ${user.name || user.login}`;
  const body = rows
    .map(([icon, label, value], i) => {
      const y = 70 + i * 28;
      return `<g transform="translate(25 ${y})">
    <svg width="16" height="16" viewBox="0 0 16 16" y="-12"><path fill="${theme.icon}" fill-rule="evenodd" d="${icons[icon]}"/></svg>
    <text x="28" class="label">${esc(label)}:</text>
    <text x="${width - 50}" class="value" text-anchor="end">${fmt(value)}</text>
  </g>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.title}; }
    .label { font: 600 14px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.text}; }
    .value { font: 700 14px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.value}; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="${theme.bg}" stroke="${theme.border}"/>
  <text x="25" y="38" class="title">${esc(title)}</text>
  ${body}
</svg>
`;
}

function activityGraph(user, days = 31) {
  const all = user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const data = all.slice(-days);
  const width = 1000;
  const height = 320;
  const pad = { top: 60, right: 30, bottom: 50, left: 55 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(4, ...data.map((d) => d.contributionCount));
  const yMax = Math.ceil(max / 4) * 4;
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const x = (i) => pad.left + i * step;
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;

  const points = data.map((d, i) => [x(i), y(d.contributionCount)]);
  const line = points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = points.length
    ? `${line} L${points.at(-1)[0].toFixed(1)} ${pad.top + plotH} L${points[0][0].toFixed(1)} ${pad.top + plotH} Z`
    : "";

  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const v = (yMax / 4) * i;
      const gy = y(v).toFixed(1);
      return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${gy}" y2="${gy}" stroke="${theme.grid}" stroke-dasharray="4 4"/>
  <text x="${pad.left - 12}" y="${gy}" class="axis" text-anchor="end" dominant-baseline="middle">${v}</text>`;
    })
    .join("\n  ");

  const labels = data
    .map((d, i) => (i % 3 === 0 || i === data.length - 1 ? [i, d.date.slice(8, 10)] : null))
    .filter(Boolean)
    .map(([i, day]) => `<text x="${x(i).toFixed(1)}" y="${pad.top + plotH + 24}" class="axis" text-anchor="middle">${day}</text>`)
    .join("\n  ");

  const dots = points
    .map(([px, py], i) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${theme.point}"><title>${data[i].date}: ${data[i].contributionCount}</title></circle>`)
    .join("\n  ");

  const title = `Atividade de ${user.name || user.login} nos últimos ${data.length} dias`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <defs>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.line}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${theme.line}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.title}; }
    .axis { font: 400 12px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.text}; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="${theme.bg}" stroke="${theme.border}"/>
  <text x="${width / 2}" y="36" class="title" text-anchor="middle">${esc(title)}</text>
  ${grid}
  <path d="${area}" fill="url(#fill)"/>
  <path d="${line}" fill="none" stroke="${theme.line}" stroke-width="2.5" stroke-linejoin="round"/>
  ${dots}
  ${labels}
  <text x="${width / 2}" y="${height - 8}" class="axis" text-anchor="middle">Dias</text>
  <text x="16" y="${pad.top + plotH / 2}" class="axis" text-anchor="middle" transform="rotate(-90 16 ${pad.top + plotH / 2})">Contribuições</text>
</svg>
`;
}

const user = await fetchUser();
if (!user) throw new Error(`Usuário "${login}" não encontrado`);
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "github-stats.svg"), statsCard(user));
await writeFile(join(outDir, "activity-graph.svg"), activityGraph(user));
console.log(`Cards gerados em ${outDir}/`);
