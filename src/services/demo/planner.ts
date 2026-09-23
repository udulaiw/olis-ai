// Algorithmic study planner — deterministic, works offline.
// Splits the time before an exam into Learn → Practice → Revise → Mock phases,
// spreads syllabus topics across days, and sizes sessions to the hours available.
import type { StudyPlan, StudyPlanDay, Subject } from "../../types";
import { toISODate } from "../../lib/utils";
import { SYLLABUS } from "./knowledge";

export interface PlanInput {
  subject: string;
  days: number; // days until the exam (exam day not included)
  hoursPerDay: number;
  topics?: string[];
  startDate?: Date;
}

const SESSION = 50; // minutes of focus per block (50/10 rhythm)

function blocks(hours: number) {
  return Math.max(1, Math.round((hours * 60) / (SESSION + 10)));
}

export function buildStudyPlan(input: PlanInput): StudyPlan {
  const days = Math.max(1, Math.min(120, Math.round(input.days)));
  const hours = Math.max(0.5, Math.min(14, input.hoursPerDay));
  const subjectKey = (Object.keys(SYLLABUS) as Subject[]).find(
    (s) => s.toLowerCase() === input.subject.toLowerCase(),
  );
  const topics = input.topics?.filter(Boolean).length
    ? input.topics!.filter(Boolean)
    : SYLLABUS[subjectKey ?? "General"];

  const start = input.startDate ?? new Date();
  start.setHours(0, 0, 0, 0);
  const exam = new Date(start);
  exam.setDate(exam.getDate() + days);

  // Phase lengths
  let learn: number, practice: number, revise: number, mock: number;
  if (days <= 2) {
    learn = 0; practice = 0; revise = days - 1; mock = 0;
  } else if (days <= 5) {
    learn = Math.ceil((days - 1) * 0.5); practice = 0; mock = 1; revise = days - 1 - learn - mock;
  } else {
    const usable = days - 1; // final day = light review
    mock = Math.max(1, Math.round(usable * 0.12));
    revise = Math.max(1, Math.round(usable * 0.18));
    practice = Math.max(1, Math.round(usable * 0.28));
    learn = usable - mock - revise - practice;
  }

  const nBlocks = blocks(hours);
  const schedule: StudyPlanDay[] = [];
  const topicPerLearnDay = learn > 0 ? Math.ceil(topics.length / learn) : 0;
  let topicIdx = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const iso = toISODate(date);
    const day = i + 1;
    const tasks: { label: string; minutes: number }[] = [];

    if (i === days - 1) {
      schedule.push({
        day, date: iso, phase: "Light review",
        focus: "Stay calm, sleep well",
        tasks: [
          { label: "Skim your formula sheet and error log", minutes: 30 },
          { label: "Flashcards: quick run through weak cards only", minutes: 20 },
          { label: "Pack your exam kit and plan your route", minutes: 10 },
          { label: "Stop studying by the evening and get a full night's sleep", minutes: 0 },
        ],
      });
      continue;
    }

    if (i < learn) {
      const today = topics.slice(topicIdx, topicIdx + topicPerLearnDay);
      topicIdx += topicPerLearnDay;
      const focus = today.length ? today.join(" + ") : "Catch-up & consolidation";
      const per = Math.max(1, nBlocks - 1);
      today.forEach((t) => {
        const n = Math.max(1, Math.round(per / today.length));
        tasks.push({ label: `Learn: ${t}. Make concise notes and work 3 examples`, minutes: n * SESSION });
      });
      if (!today.length) tasks.push({ label: "Revisit anything that felt shaky this week", minutes: per * SESSION });
      tasks.push({ label: "Active recall: blank-page summary + flashcards of today's topics", minutes: SESSION });
      if (i >= 2) tasks.push({ label: `Spaced review: ${topics[Math.max(0, topicIdx - topicPerLearnDay * 3)] ?? "earlier topics"}`, minutes: 20 });
      schedule.push({ day, date: iso, phase: "Learn", focus, tasks });
    } else if (i < learn + practice) {
      const pIdx = i - learn;
      const a = topics[(pIdx * 2) % topics.length];
      const b = topics[(pIdx * 2 + 1) % topics.length];
      tasks.push({ label: `Mixed problem set: ${a} & ${b} (interleaved)`, minutes: Math.max(1, nBlocks - 1) * SESSION });
      tasks.push({ label: "Mark your work and log every mistake in an error log", minutes: SESSION });
      schedule.push({ day, date: iso, phase: "Practice", focus: `${a} · ${b}`, tasks });
    } else if (i < learn + practice + revise) {
      tasks.push({ label: "Review your error log and redo the questions you got wrong", minutes: SESSION });
      tasks.push({ label: "Weak-topic deep dive: pick the 2 lowest-confidence topics", minutes: Math.max(1, nBlocks - 2) * SESSION });
      tasks.push({ label: "Rebuild your formula / definitions sheet from memory", minutes: 30 });
      schedule.push({ day, date: iso, phase: "Revise", focus: "Weak areas & error log", tasks });
    } else {
      tasks.push({ label: "Full timed past paper under exam conditions", minutes: Math.min(nBlocks, 3) * 60 });
      if (nBlocks > 3) tasks.push({ label: "Mark with the scheme and note where marks were lost", minutes: 60 });
      else tasks.push({ label: "Mark it and note where marks were lost", minutes: 30 });
      schedule.push({ day, date: iso, phase: "Mock exam", focus: "Exam conditions", tasks });
    }
  }

  const tips = [
    `Work in ${SESSION}-minute focus blocks with 10-minute breaks, and keep your phone out of reach.`,
    "Test yourself before re-reading. Recall first, then check your notes.",
    "Keep an error log. It's the most valuable revision document you'll make.",
    days >= 7 ? "Protect one lighter evening per week to avoid burnout." : "Short on time: prioritise high-mark topics and past-paper questions.",
    "Sleep is when memory consolidates, so don't trade it for late-night cramming.",
  ];

  return {
    subject: input.subject,
    examDate: toISODate(exam),
    days,
    hoursPerDay: hours,
    schedule,
    tips,
  };
}

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

/** Markdown version of a plan, for chat responses. */
export function planToMarkdown(plan: StudyPlan): string {
  const phases = ["Learn", "Practice", "Revise", "Mock exam", "Light review"] as const;
  const counts = phases
    .map((p) => [p, plan.schedule.filter((d) => d.phase === p).length] as const)
    .filter(([, n]) => n > 0);
  const out: string[] = [
    `## ${plan.days}-day ${plan.subject} study plan`,
    `**Exam:** ${fmtDate(plan.examDate)} · **Daily time:** ${plan.hoursPerDay}h`,
    `**Phases:** ${counts.map(([p, n]) => `${p} (${n}d)`).join(" → ")}`,
  ];

  if (plan.days <= 14) {
    const rows = ["| Day | Phase | Focus | Main tasks |", "|---|---|---|---|"];
    for (const d of plan.schedule) {
      rows.push(
        `| ${d.day} · ${fmtDate(d.date)} | ${d.phase} | ${d.focus} | ${d.tasks
          .filter((t) => t.minutes > 0)
          .map((t) => `${t.label} (${mins(t.minutes)})`)
          .join("<br>")} |`,
      );
    }
    out.push(rows.join("\n"));
  } else {
    // Group into weeks to keep the chat readable
    for (let w = 0; w < plan.schedule.length; w += 7) {
      const week = plan.schedule.slice(w, w + 7);
      const phasesInWeek = Array.from(new Set(week.map((d) => d.phase))).join(" / ");
      out.push(`### Week ${w / 7 + 1}: ${fmtDate(week[0].date)} – ${fmtDate(week[week.length - 1].date)}`);
      out.push(`*${phasesInWeek}*`);
      out.push(week.map((d) => `- **Day ${d.day}** · ${d.phase}: ${d.focus}`).join("\n"));
    }
  }
  out.push("### How to use this plan", plan.tips.map((t) => `- ${t}`).join("\n"));
  out.push("*Want an interactive, day-by-day version? Open **Study Tools → Study Planner**.*");
  return out.join("\n\n");
}
