import { useEffect, useState } from 'react';

// One shared 60-second heartbeat: components mount this hook, get a tick value
// that increments every minute, and re-render so live "elapsed" pills (on
// premises clock, scan-to-now interval) advance without re-fetching from the
// server.
//
// Keep this dependency-free and side-effect-free aside from the timer — many
// boards mount it simultaneously and each instance has its own interval, but
// the cost is negligible (one setInterval per board) and decouples the boards
// from each other.
export default function useTickClock(intervalMs = 60_000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}
