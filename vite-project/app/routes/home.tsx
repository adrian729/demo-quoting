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

  const headers = fileData?.[0] || [];
  const rows = fileData?.slice(1) || [];

  return (
    <div className='w-full h-screen bg-slate-800 p-8 text-slate-200 flex flex-col gap-6'>
      <form className='flex flex-col gap-2'>
        <label htmlFor='csvInput' className='font-semibold text-slate-300'>
          Upload File
        </label>
        <input
          className='block w-full max-w-md cursor-pointer rounded-lg border border-slate-600 bg-slate-700 text-sm text-slate-200 file:mr-4 file:cursor-pointer file:border-0 file:bg-slate-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-500'
          onChange={handleFileChange}
          id='csvInput'
          name='file'
          type='file'
          accept='.csv,.xls,.xlsx,.txt'
        />
      </form>

      {!!error && <div className='text-red-400 font-medium'>{error}</div>}

      {fileData && (
        <div className='border border-slate-700 rounded-lg overflow-hidden shadow-lg bg-slate-800 flex-1'>
          <div className='h-full overflow-auto'>
            <table className='w-full text-left text-sm text-slate-400'>
              <thead className='bg-slate-900 text-xs font-bold uppercase text-slate-200 sticky top-0 z-10 shadow-sm'>
                <tr>
                  {headers.map((header, index) => (
                    <th
                      key={index}
                      className='px-6 py-3 tracking-wider whitespace-nowrap bg-slate-900'
                    >
                      {String(header ?? "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-700'>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className='hover:bg-slate-700/50 transition-colors'
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className='px-6 py-4 whitespace-nowrap font-medium text-slate-300'
                      >
                        {String(cell ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
