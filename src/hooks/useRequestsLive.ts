import { useEffect, useRef, useState } from "react";
import { listRequests, subscribeRequests, type InsuranceRequest } from "@/services/api";

export function useRequestsLive(opts?: { agentId?: string; branch?: string }) {
  const [items, setItems] = useState<InsuranceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const sigRef = useRef<string>("");

  const agentId = opts?.agentId;
  const branch = opts?.branch;

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      const filter: { agentId?: string; branch?: string } = {};
      if (agentId) filter.agentId = agentId;
      if (branch) filter.branch = branch;
      listRequests(Object.keys(filter).length ? filter : undefined)
        .then((rs) => {
          if (!alive) return;
          // Cheap signature: length + ids+statuses concatenated. Skips state update if nothing changed.
          const sig = `${rs.length}|` + rs.map((r) => `${r.id}:${r.status}`).join(",");
          if (sig !== sigRef.current) {
            sigRef.current = sig;
            setItems(rs);
          }
          setLoading(false);
        })
        .catch(() => { if (alive) setLoading(false); });
    };
    refresh();
    const unsub = subscribeRequests(refresh);
    return () => { alive = false; unsub(); };
  }, [agentId, branch]);

  return { items, loading };
}
