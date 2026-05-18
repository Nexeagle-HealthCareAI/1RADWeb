import os

file_path = r"c:\Users\mtnoo\OneDrive\Desktop\1Rad\easyrad\src\pages\AdminBoard.jsx"

if not os.path.exists(file_path):
    print(f"Error: File {file_path} does not exist")
    exit(1)

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

idx = -1
for i, line in enumerate(lines):
    if "Operational Peak Matrix (Daily)" in line:
        idx = i
        break

if idx == -1:
    print("Error: Could not find 'Operational Peak Matrix (Daily)' in the file.")
    exit(1)

print(f"Found indicator at 0-indexed line {idx}")
print("--- PREVIEW OF LINES ---")
for offset in range(-2, 14):
    line_num = idx + offset
    if 0 <= line_num < len(lines):
        print(f"Line {line_num + 1}: {repr(lines[line_num])}")
