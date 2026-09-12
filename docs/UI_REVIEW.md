# Interface copy review

Reviewed the Applications catalog, Help, Notes, Canvas, Tasks, Settings, and first-run overlay after the request for a lighter, more direct interface. Scope is presentation and discoverability; no apps or features were removed.

## Applied in this pass

- Applications uses action descriptions and the headings **Built-in apps**, **Add apps**, **Installed apps**, and **Open a workspace**. Removed the header/footer slogans and package/license prose from app descriptions; licenses remain in documentation. App combinations name the tools they open.
- Help retains the model-optional explanation, shortcuts, backup, source editing, agent guide, and diagnostics. Replaced broad claims and repeated explanations with shorter instructions. Backups are described as files and app data, not a complete machine/session image.
- Notes uses concrete empty states and a brief getting-started note for new notebooks. Existing notes are untouched.
- Canvas uses **Empty canvas**, a drawing instruction, and **Insert example diagram**. Its example labels are Input and Output.
- Updated the existing diagnostics browser-test heading selector to match **Diagnostics**. No behavior was changed.

## Follow-through

| Surface                    | Current copy                                         | Recommended copy                                                                                                  |
| -------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Settings heading           | “YOUR DESKTOP / Make yourself at home.” plus tagline | “Settings”; remove eyebrow and tagline                                                                            |
| Settings install section   | “Keep the desktop close”                             | “Install app”                                                                                                     |
| Settings storage heading   | “Your browser’s filesystem”                          | “Storage”                                                                                                         |
| Settings backup heading    | “Take your work with you”                            | “Backup & restore”                                                                                                |
| Tasks new task placeholder | “What would you like to get done?”                   | “Add a task”                                                                                                      |
| Tasks empty To do          | “Make a little room for what matters.”               | “No tasks yet.”                                                                                                   |
| Tasks empty In progress    | “One thing at a time.”                               | “No tasks in progress.”                                                                                           |
| Tasks empty Done           | “Small steps count.”                                 | “No completed tasks.”                                                                                             |
| Tasks focus bar            | “A little space for focused work”                    | “Focus timer”                                                                                                     |
| Welcome lead               | “A browser desktop with Omarchy’s habits.”           | “A desktop for local apps and agent work.”                                                                        |
| Welcome footer             | “Local files. Your workspace.”                       | Remove; the body already explains file storage                                                                    |
| Routine launch toast       | “opened apps”, “opened canvas”                       | Suppress successful launch notifications; reserve transient messages for failures and important completion states |

The parent task applied the Settings and Tasks simplifications, removed routine successful-launch toasts, and rewrote onboarding with touch-specific controls. The table records the original review recommendations; current source contains the subsequent changes.

## Visual evidence

Captured fresh browser contexts before and after at 1280×800, without changing the user's desktop. Screenshots show the actual application tiles.

- Applications: `/tmp/oma-copy-before-applications.png`, `/tmp/oma-copy-after-applications.png`
- Help: `/tmp/oma-copy-before-help.png`, `/tmp/oma-copy-after-help.png`
- Notes: `/tmp/oma-copy-before-notes.png`, `/tmp/oma-copy-after-notes.png`
- Canvas: `/tmp/oma-copy-before-canvas.png`, `/tmp/oma-copy-after-canvas.png`

The after view fits more app rows and exposes the beginning of Diagnostics without extra scrolling. Typography, Tokyo Night colors, borders, and control geometry are preserved. Screenshot capture tests were temporary and removed after capture; the normal interaction tests remain the regression suite.
