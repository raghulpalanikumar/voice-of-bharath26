import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Path to the python query helper script
const SCRIPT_PATH = path.resolve(process.cwd(), '..', 'backend', 'src', 'query_calls.py');

export async function GET() {
  try {
    // Run stats action: python backend/src/query_calls.py stats
    const cmdStats = `python "${SCRIPT_PATH}" stats`;
    const { stdout: stdoutStats, stderr: stderrStats } = await execPromise(cmdStats);
    if (stderrStats) {
      console.error('Python query stats stderr:', stderrStats);
    }
    const stats = JSON.parse(stdoutStats.trim());

    // Run list action: python backend/src/query_calls.py list
    const cmdList = `python "${SCRIPT_PATH}" list`;
    const { stdout: stdoutList, stderr: stderrList } = await execPromise(cmdList);
    if (stderrList) {
      console.error('Python query list stderr:', stderrList);
    }
    const list = JSON.parse(stdoutList.trim());

    return NextResponse.json({ stats, history: list });
  } catch (error: any) {
    console.error('Failed to query calls:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
