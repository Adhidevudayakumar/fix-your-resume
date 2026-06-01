/**
 * JD Keyword Extractor
 * Multi-strategy extraction:
 *  1. Tech whitelist — catches lowercase tech terms (react, python, docker…)
 *  2. N-gram scoring — 1–3 word phrases ranked by frequency × position weight
 *  3. Capitalized proper nouns — company tools, frameworks with brand casing
 *  4. Hyphenated / dotted terms — CI/CD, Node.js, full-stack
 */

// ─── Comprehensive tech + skill whitelist ────────────────────────────────────
const TECH_WHITELIST: string[] = [
  // Languages
  'python','javascript','typescript','java','c++','c#','go','golang','rust','ruby',
  'php','swift','kotlin','scala','r','matlab','perl','bash','shell','powershell',
  'html','css','sass','scss','sql','nosql','graphql','lua','elixir','dart','flutter',
  // Frontend
  'react','react.js','reactjs','vue','vue.js','angular','next.js','nextjs','nuxt',
  'svelte','redux','zustand','mobx','webpack','vite','rollup','babel','tailwind',
  'bootstrap','material ui','chakra ui','storybook','cypress','jest','vitest',
  'playwright','puppeteer','d3.js','three.js','webgl','canvas',
  // Backend
  'node.js','nodejs','express','fastapi','django','flask','spring','spring boot',
  'laravel','rails','ruby on rails','asp.net','nestjs','hapi','koa','gin','fiber',
  'graphql','rest','rest api','restful','grpc','websocket','oauth','jwt','saml',
  // Databases
  'postgresql','postgres','mysql','sqlite','mongodb','redis','cassandra','dynamodb',
  'elasticsearch','neo4j','firebase','supabase','prisma','sequelize','typeorm',
  'sqlalchemy','hibernate','mariadb','oracle','mssql','influxdb','clickhouse',
  // Cloud & DevOps
  'aws','azure','gcp','google cloud','docker','kubernetes','k8s','terraform',
  'ansible','jenkins','github actions','gitlab ci','circleci','travisci',
  'helm','istio','nginx','apache','linux','ubuntu','debian','centos','rhel',
  'cloudformation','pulumi','serverless','lambda','ecs','eks','gke','aks',
  's3','ec2','rds','sqs','sns','cloudwatch','datadog','grafana','prometheus',
  'vault','consul','etcd','kafka','rabbitmq','sqs','celery','airflow',
  // AI/ML
  'machine learning','deep learning','nlp','computer vision','pytorch','tensorflow',
  'keras','scikit-learn','pandas','numpy','opencv','hugging face','langchain',
  'openai','llm','rag','vector database','pinecone','weaviate','mlops',
  'data science','data engineering','etl','feature engineering','model training',
  'regression','classification','clustering','neural network','transformer',
  // Tools
  'git','github','gitlab','bitbucket','jira','confluence','notion','slack',
  'postman','swagger','openapi','figma','sketch','zeplin','linear','asana',
  'trello','sentry','logstash','kibana','splunk','pagerduty','newrelic',
  'sonarqube','snyk','trivy','owasp',
  // Architecture / Practices
  'microservices','monolith','event-driven','cqrs','ddd','solid','clean architecture',
  'tdd','bdd','ci/cd','devops','devsecops','sre','agile','scrum','kanban','lean',
  'pair programming','code review','mob programming',
  // Security
  'cybersecurity','penetration testing','sso','iam','rbac','encryption','ssl','tls',
  'zero trust','siem','vulnerability','compliance','gdpr','hipaa','soc2',
];

const TECH_SET = new Set(TECH_WHITELIST.map(t => t.toLowerCase()));

// ─── Stop words ──────────────────────────────────────────────────────────────
const STOP = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall','can',
  'this','that','these','those','it','its','we','you','they','their','our',
  'your','all','any','each','few','more','most','other','some','such','no',
  'not','only','same','so','than','too','very','just','about','above','after',
  'as','into','through','during','including','until','against','between',
  'within','without','along','following','across','behind','beyond','plus',
  'except','up','down','out','off','over','under','again','then','once',
  'here','there','when','where','why','how','who','whom','which','what',
  'if','while','although','because','since','whether','both','either',
  'neither','nor','yet','also','well','must','need','use','using','used',
  'ensure','support','help','work','works','working','provide','required',
  'requirements','ability','strong','excellent','good','experience','years',
  'year','team','role','position','looking','seeking','join','new','opportunity',
  'preferred','plus','bonus','responsible','responsibilities','candidate',
  'ideal','proven','demonstrated','skills','skill','knowledge','understanding',
  'ability','familiarity','hands','experience','background','passion',
  'motivated','self','driven','fast','paced','environment','startup','company',
  'job','work','day','time','make','take','come','get','give','keep','let',
  'put','seem','tell','ask','mean','become','leave','show','feel','try','call',
  'might','move','live','stand','turn','start','show','play','run','move',
]);

// ─── Normalize / clean a candidate string ────────────────────────────────────
function clean(s: string): string {
  return s.trim().replace(/[.,;:!?()\[\]{}"'`]+$/g, '').replace(/^[.,;:!?()\[\]{}"'`]+/, '');
}

function isValidKeyword(s: string): boolean {
  const t = s.toLowerCase().trim();
  if (!t || t.length < 2) return false;
  if (/^\d+(\+|\s*years?)?$/i.test(t)) return false; // pure numbers / "5 years"
  if (STOP.has(t)) return false;
  // must contain at least one letter
  if (!/[a-zA-Z]/.test(t)) return false;
  return true;
}

// ─── Strategy 1: Whitelist scan ──────────────────────────────────────────────
function whitelistScan(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  const lower = text.toLowerCase();

  // Longer phrases first to avoid partial matches being double-counted
  const sorted = [...TECH_WHITELIST].sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    const regex = new RegExp(`(?<![a-z0-9/-])${escapeRegex(term)}(?![a-z0-9/-])`, 'gi');
    const count = (lower.match(regex) ?? []).length;
    if (count > 0) {
      // Use the casing from the JD if available, else use whitelist casing
      const found = text.match(new RegExp(`(?<![a-z0-9/-])${escapeRegex(term)}(?![a-z0-9/-])`, 'i'));
      const label = found?.[0] ?? term;
      freq.set(label, count);
    }
  }
  return freq;
}

// ─── Strategy 2: N-gram extraction (1–3 words) ───────────────────────────────
function ngramExtract(text: string): Map<string, number> {
  const freq = new Map<string, number>();

  // Split into sentences/lines for position weighting
  const lines = text.split(/[\n.!?]+/).map(l => l.trim()).filter(Boolean);

  lines.forEach((line, lineIdx) => {
    // Lines near the top ("Requirements", "Qualifications") get higher weight
    const posWeight = lineIdx < lines.length * 0.6 ? 1.5 : 1;
    const words = line.split(/\s+/).map(clean).filter(Boolean);

    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(' ');
        const pLower = phrase.toLowerCase();

        if (!isValidKeyword(pLower)) continue;
        if (n === 1 && STOP.has(pLower)) continue;
        // For multi-word phrases, neither first nor last word should be a stop word
        if (n > 1) {
          const parts = pLower.split(' ');
          if (STOP.has(parts[0]) || STOP.has(parts[parts.length - 1])) continue;
        }
        // Skip very generic single words unless they're in tech whitelist
        if (n === 1 && !TECH_SET.has(pLower) && phrase === phrase.toLowerCase()) continue;

        const existing = freq.get(phrase) ?? freq.get(pLower) ?? 0;
        freq.set(phrase, existing + posWeight);
      }
    }
  });

  return freq;
}

// ─── Strategy 3: Capitalized proper nouns & branded terms ────────────────────
function properNounExtract(text: string): Map<string, number> {
  const freq = new Map<string, number>();

  // 1–3 capitalized words (e.g. "Amazon Web Services", "Apache Kafka")
  const matches = text.match(/\b[A-Z][a-zA-Z0-9+#.]*(?:\s+[A-Z][a-zA-Z0-9+#.]*){0,2}\b/g) ?? [];
  for (const m of matches) {
    const c = clean(m);
    if (!isValidKeyword(c)) continue;
    if (STOP.has(c.toLowerCase())) continue;
    if (c.length < 2) continue;
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }
  return freq;
}

// ─── Strategy 4: Special patterns (CI/CD, Node.js, full-stack) ───────────────
function specialPatterns(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  const patterns = [
    /\b[A-Za-z]+(?:\/[A-Za-z]+)+\b/g,           // CI/CD, TCP/IP
    /\b[A-Za-z]+(?:\.[A-Za-z]+){1,2}\b/g,        // Node.js, Vue.js, .NET
    /\b[A-Za-z]+-[A-Za-z]+(?:-[A-Za-z]+)?\b/g,  // full-stack, micro-services
    /\b[A-Z]{2,}\b/g,                             // AWS, API, SQL, REST
  ];
  for (const pat of patterns) {
    const matches = text.match(pat) ?? [];
    for (const m of matches) {
      const c = clean(m);
      if (!isValidKeyword(c) || STOP.has(c.toLowerCase())) continue;
      freq.set(c, (freq.get(c) ?? 0) + 1);
    }
  }
  return freq;
}

// Remove entries that are substrings of higher-scoring entries
function deduplicateSubstrings(freq: Map<string, number>): Map<string, number> {
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const result = new Map<string, number>();
  for (const [term, score] of sorted) {
    const tLow = term.toLowerCase();
    let dominated = false;
    for (const [existing] of result) {
      const eLow = existing.toLowerCase();
      // If a longer phrase already contains this term, skip
      if (eLow !== tLow && eLow.includes(tLow) && (result.get(existing) ?? 0) >= score * 0.7) {
        dominated = true;
        break;
      }
    }
    if (!dominated) result.set(term, score);
  }
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function extractJDKeywords(jd: string, limit = 35): string[] {
  if (!jd.trim()) return [];

  const w = whitelistScan(jd);
  const n = ngramExtract(jd);
  const p = properNounExtract(jd);
  const s = specialPatterns(jd);

  // Whitelist hits get 3× boost (they are very reliable)
  const boosted = new Map<string, number>();
  for (const [k, v] of w) boosted.set(k, v * 3);
  for (const [k, v] of n) boosted.set(k, (boosted.get(k) ?? 0) + v);
  for (const [k, v] of p) boosted.set(k, (boosted.get(k) ?? 0) + v);
  for (const [k, v] of s) boosted.set(k, (boosted.get(k) ?? 0) + v);

  const deduped = deduplicateSubstrings(boosted);

  return [...deduped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term)
    .filter(isValidKeyword);
}
