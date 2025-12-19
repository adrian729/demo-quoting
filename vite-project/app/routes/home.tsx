import { useState, type ChangeEvent } from "react";
import { parseFile } from "~/utils/excelUtils";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  const [fileData, setFileData] = useState<unknown[][]>();
  const [error, setError] = useState<string>();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(undefined);

    if (!e.target.files?.length) {
      setError("No file selected");
      return;
    }

    const inputFile = e.target.files[0];

    try {
      const rawData = await parseFile(inputFile);

      if (rawData.length === 0) {
        setError("The file is empty or has no valid data");
        return;
      }

      setFileData(rawData);
      console.log("Parsed File Data:", rawData);
    } catch (err) {
      console.error("Error processing file:", err);
      setError(
        "Failed to parse the file. Please ensure it is a valid CSV or Excel file."
      );
    }
  };

  return (
    <div className='w-full h-screen bg-slate-800'>
      <form>
        <input
          className='text-slate-800 bg-slate-100 border-2 border-slate-500'
          onChange={handleFileChange}
          id='csvInput'
          name='file'
          type='file'
          accept='.csv,.xls,.xlsx,.txt'
        />
      </form>
      {!!error && <div className='text-red-500'>{error}</div>}
    </div>
  );
}
