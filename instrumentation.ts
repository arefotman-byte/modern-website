/** Runs once when the Next.js server starts. Starts the autopilot if AUTOPILOT=1. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.AUTOPILOT === '1') {
    const { startAutopilot } = await import('./lib/autopilot');
    startAutopilot();
  }
}
