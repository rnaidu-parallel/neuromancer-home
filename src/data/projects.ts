/**
 * projects.ts — the four shipped projects rendered in span 02 (get_projects()).
 *
 * Every string here is VERBATIM and audited against published sources — the
 * terminal output lines double as claims the public repos must reproduce, so do
 * not "improve", re-round, or re-word any number, symbol, or link.
 */

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  /** stable id (anchor / keying) */
  id: string;
  /** repo-style name shown as the tool result heading */
  name: string;
  /** the tool_call args, e.g. get_projects({ tag: "mcp" }) */
  invocation: string;
  /** human-voice claim (sans, prose) */
  claim: string;
  /** the terminal command line ($ …) */
  command: string;
  /** terminal output lines (> …) */
  output: string[];
  /** meta-row links */
  links: ProjectLink[];
}

export const projects: Project[] = [
  {
    id: 'mcp',
    name: 'neuromancer-mcp',
    invocation: 'get_projects({ tag: "mcp" })',
    claim:
      "Publish yourself as a remote MCP server. A company's agent connects, reads what you've shipped, and reaches out if there's a fit.",
    command: 'claude mcp add --transport http rahul https://mcp.neuromancer.in/api/mcp',
    output: [
      'connected · 8 tools: about_me, get_experience, list_projects, search, fit_for_role, availability, get_profile, contact_me',
      'live — your agent can interview him before you do',
    ],
    links: [
      {
        label: 'github.com/rnaidu-parallel/neuromancer-mcp',
        href: 'https://github.com/rnaidu-parallel/neuromancer-mcp',
      },
      { label: 'mcp.neuromancer.in', href: 'https://mcp.neuromancer.in' },
    ],
  },
  {
    id: 'coercion',
    name: 'agent-coercion-layer',
    invocation: 'get_projects({ tag: "reliability" })',
    claim:
      "Swap the model under an agent and the model still works. The shape of its output is what breaks. Measured raw, with the framework's repair layer off.",
    command: 'npm run eval',
    output: [
      'finding: one field modifier decides whether a tool call survives',
      '.nullable() truncates the whole call on some models · .optional() fixes it',
      'ships a coercion layer that recovers breakages and logs every repair',
    ],
    links: [
      {
        label: 'github.com/rnaidu-parallel/agent-coercion-layer',
        href: 'https://github.com/rnaidu-parallel/agent-coercion-layer',
      },
      {
        label: 'writeup',
        href: 'https://blog.neuromancer.in/blog/coercion-layer-when-swapping-models/',
      },
    ],
  },
  {
    id: 'cache',
    name: 'prompt-cache-economics',
    invocation: 'get_projects({ tag: "cost" })',
    claim:
      'A timestamp at the top of your system prompt is a 0% cache hit. On some providers that costs more than not caching at all.',
    command: 'npm run bench  # 6-turn session · real billed cost · 2026-06-09',
    output: [
      'naive (timestamp in prefix): anthropic +25% vs no cache · openai +0%',
      'disciplined (timestamp in tail): −68% and −82% input cost',
      'moving one line: 73–82% cheaper',
    ],
    links: [
      {
        label: 'github.com/rnaidu-parallel/prompt-cache-economics',
        href: 'https://github.com/rnaidu-parallel/prompt-cache-economics',
      },
      { label: 'cache.neuromancer.in (live demo)', href: 'https://cache.neuromancer.in' },
      { label: 'writeup', href: 'https://blog.neuromancer.in/blog/prompt-cache-timestamp/' },
    ],
  },
  {
    id: 'local',
    name: '6GB-VRAM local agent',
    invocation: 'get_projects({ tag: "local-inference" })',
    claim:
      'A usable personal agent on a 2018 laptop with 6GB of VRAM. On a small GPU the KV cache, not the weight count, is what overflows. Architecture beats quantization.',
    command: 'ollama ps',
    output: [
      'qwen3-4b · 4.6GB in VRAM at 64k context · 44.3 tok/s',
      'dense 8B on the same task: 8–13 tok/s — the split, not the tag, decides',
      '$0 per token · nothing leaves the machine',
    ],
    links: [
      { label: 'writeup', href: 'https://blog.neuromancer.in/blog/6gb-vram-local-agent/' },
    ],
  },
];
