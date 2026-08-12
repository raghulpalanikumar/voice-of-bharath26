import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Path to the python query helper script
const SCRIPT_PATH = path.resolve(process.cwd(), '..', 'backend', 'src', 'query_escalations.py');

export async function GET() {
  try {
    // Run: python backend/src/query_escalations.py list
    const cmd = `python "${SCRIPT_PATH}" list`;
    const { stdout, stderr } = await execPromise(cmd);
    
    if (stderr) {
      console.error('Python query stderr:', stderr);
    }
    
    const escalations = JSON.parse(stdout.trim());
    return NextResponse.json(escalations);
  } catch (error: any) {
    console.error('Failed to query escalations:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, status } = await req.json();
    if (id === undefined || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }
    
    // Run: python backend/src/query_escalations.py update <id> <status>
    const cmd = `python "${SCRIPT_PATH}" update ${id} "${status}"`;
    const { stdout, stderr } = await execPromise(cmd);
    
    if (stderr) {
      console.error('Python update stderr:', stderr);
    }
    
    const result = JSON.parse(stdout.trim());
    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: result.error || 'Failed to update' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Failed to update escalation:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
