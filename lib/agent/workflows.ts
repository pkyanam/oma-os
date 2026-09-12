export const workflows = [
  {
    id: "app",
    title: "Build a tiny app",
    detail: "A useful tool, saved as editable HTML.",
    prompt:
      "Build a useful self-contained local app in /home/guest/Projects. First ask me what problem it should solve. Then implement real working controls, responsive styling, and JSON import/export for user data. Open the finished HTML in the OS browser.",
  },
  {
    id: "research",
    title: "Make sense of my files",
    detail: "Turn attached notes into an actionable brief.",
    prompt:
      "Review the files I attach. Extract the main ideas, unresolved questions, and concrete next actions. Preserve source filenames. Write a concise Markdown brief in /home/guest/Documents, then open it. Do not invent facts not supported by these files.",
  },
  {
    id: "learn",
    title: "Make a learning lab",
    detail: "An interactive lesson on your topic.",
    prompt:
      "Help me learn a topic with an interactive self-contained HTML learning lab saved in /home/guest/Projects. Ask me for the topic and my experience first. Include a visual demonstration with controls, explanations, and a short self-check with feedback. Open the result in the OS browser.",
  },
  {
    id: "data",
    title: "Explore a dataset",
    detail: "A reproducible Python analysis plan.",
    prompt:
      "Help me explore a CSV file in this desktop. Ask which file to use if none is attached. Inspect it, identify data-quality issues, and write a Python analysis script to /home/guest/Projects that I can run in Lab. Include descriptive statistics and a visualization when suitable. Explain how to run it and do not claim you executed it yourself.",
  },
  {
    id: "review",
    title: "Review a project",
    detail: "Find specific problems before changing code.",
    prompt:
      "Review a local project for correctness, accessibility, and responsive behavior. Ask me which folder to review. Read relevant files, identify concrete issues with filenames and evidence, and propose a short fix plan. Only modify files after I ask you to implement the plan.",
  },
  {
    id: "day",
    title: "Design my work session",
    detail: "A clear plan with files and workspace setup.",
    prompt:
      "Help me turn a goal into a focused work session. Ask me for the goal, available time, and existing notes. Then save a practical session plan in /home/guest/Documents with milestones and a definition of done. Open the plan and the relevant desktop apps.",
  },
] as const;
