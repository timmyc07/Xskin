using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace CodexDreamSkin {
  public static class WatcherProcess {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo {
      public int Size;
      public string Reserved, Desktop, Title;
      public int X, Y, Width, Height, Columns, Rows, Fill, Flags;
      public short ShowWindow, ReservedSize;
      public IntPtr ReservedBytes, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfoEx { public StartupInfo Info; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { public IntPtr Process, Thread; public int Pid, Tid; }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(IntPtr list, int flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returnedSize);
    [DllImport("kernel32.dll")]
    private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(IntPtr handle, int mask, int flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFile(string name, uint access, int share, IntPtr security, int creation, int flags, IntPtr template);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string application, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity,
      bool inherit, int flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    public static Process Start(string executable, string command, string directory, string stdout, string stderr) {
      using (var output = new FileStream(stdout, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
      using (var error = new FileStream(stderr, FileMode.Create, FileAccess.Write, FileShare.ReadWrite)) {
        IntPtr input = CreateFile("NUL", 0x80000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
        if (input == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
        IntPtr attributes = IntPtr.Zero, handles = IntPtr.Zero;
        bool initialized = false;
        try {
          IntPtr size = IntPtr.Zero;
          InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
          attributes = Marshal.AllocHGlobal(size);
          if (!InitializeProcThreadAttributeList(attributes, 1, 0, ref size)) throw new Win32Exception(Marshal.GetLastWin32Error());
          initialized = true;
          IntPtr[] inherited = { input, output.SafeFileHandle.DangerousGetHandle(), error.SafeFileHandle.DangerousGetHandle() };
          handles = Marshal.AllocHGlobal(IntPtr.Size * inherited.Length);
          for (int index = 0; index < inherited.Length; index++) {
            if (!SetHandleInformation(inherited[index], 1, 1)) throw new Win32Exception(Marshal.GetLastWin32Error());
            Marshal.WriteIntPtr(handles, index * IntPtr.Size, inherited[index]);
          }
          // An explicit handle list excludes every inherited copy of the MCP caller's pipes.
          if (!UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), handles,
            new IntPtr(IntPtr.Size * inherited.Length), IntPtr.Zero, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
          var startup = new StartupInfoEx();
          startup.Info.Size = Marshal.SizeOf(typeof(StartupInfoEx));
          startup.Info.Flags = 0x100;
          startup.Info.Input = inherited[0];
          startup.Info.Output = inherited[1];
          startup.Info.Error = inherited[2];
          startup.Attributes = attributes;
          ProcessInfo process;
          if (!CreateProcess(executable, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, true,
            0x08080000, IntPtr.Zero, directory, ref startup, out process)) throw new Win32Exception(Marshal.GetLastWin32Error());
          try {
            var child = Process.GetProcessById(process.Pid);
            // Bind the Process object before releasing the native handle so the PID cannot be reused.
            try { IntPtr handle = child.Handle; return child; }
            catch { child.Dispose(); throw; }
          } finally {
            CloseHandle(process.Thread);
            CloseHandle(process.Process);
          }
        } finally {
          if (initialized) DeleteProcThreadAttributeList(attributes);
          if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
          if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
          CloseHandle(input);
        }
      }
    }
  }
}
