import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCodeableConcept } from "@/lib/fhir/extract";

function statusVariant(status: string | undefined) {
  if (status === "in-progress") return "default";
  if (status === "finished") return "secondary";
  if (status === "cancelled" || status === "entered-in-error")
    return "destructive";
  return "outline";
}

function date(enc: fhir4.Encounter): string {
  return enc.period?.start?.slice(0, 10) ?? "—";
}

function classLabel(enc: fhir4.Encounter): string {
  const c = enc.class;
  return c?.display ?? c?.code ?? "—";
}

function typeLabel(enc: fhir4.Encounter): string {
  const t = enc.type?.[0];
  return t ? formatCodeableConcept(t) || "—" : "—";
}

function providerLabel(enc: fhir4.Encounter): string {
  const p = enc.participant?.[0]?.individual;
  return p?.display ?? p?.reference ?? "—";
}

export function EncountersList({
  encounters,
  limit,
}: {
  encounters: fhir4.Encounter[];
  limit?: number;
}) {
  const rows =
    typeof limit === "number" ? encounters.slice(0, limit) : encounters;

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No encounters on file
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((enc, i) => (
          <TableRow key={enc.id ?? `${date(enc)}-${i}`}>
            <TableCell className="font-mono text-xs">{date(enc)}</TableCell>
            <TableCell>{classLabel(enc)}</TableCell>
            <TableCell>{typeLabel(enc)}</TableCell>
            <TableCell>{providerLabel(enc)}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(enc.status)}>
                {enc.status ?? "—"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
