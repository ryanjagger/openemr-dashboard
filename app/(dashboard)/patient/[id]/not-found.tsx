import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function PatientNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Alert>
        <AlertTitle>Patient not found</AlertTitle>
        <AlertDescription className="mt-2">
          No patient with that FHIR id is on file. Check the URL or pick a
          different patient.
        </AlertDescription>
      </Alert>
    </div>
  );
}
