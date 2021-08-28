/**
 * Strictly timed async loop that yields only at intervals of the specified duration.
 * If your code runs over the schedule, iterations will be skipped to prevent concurrency/desync
 * Yields a duty cycle fraction in case you want to emit it to a metrics/observability mechanism
 * for await (const _ of fixedInterval(60000) { ... }
 */
export async function* fixedInterval(scheduledMillis: number): AsyncGenerator<number, void, void> {
  let nextTime = Date.now();
  let dutyCycle = 0;

  // go 'forever', consumers can use `break;` to end the loop anyway
  while (true) {

    // run the workload
    yield dutyCycle;

    const now = Date.now();

    // report 'how busy' we are as a fraction
    // ~0   = tons of free time
    // 0.5+ = running more than half of the time
    // 1+   = running longer than interval, skipping iterations
    dutyCycle = (now - nextTime) / scheduledMillis;

    // advance to next scheduled execution still in the future
    while (nextTime < now) nextTime += scheduledMillis;

    // calculate sleep time
    const delayMillis = nextTime - now;
    if (delayMillis < 0 || delayMillis > scheduledMillis) throw new Error(
      `BUG: wanted to sleep ${delayMillis}ms for a ${scheduledMillis}ms loop`);

    // idle until next iteration
    //console.log('sleeping', delayMillis)
    await new Promise(ok => setTimeout(ok, delayMillis));
  }
}