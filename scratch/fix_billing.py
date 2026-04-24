import os

file_path = r'c:\Users\mtnoo\OneDrive\Desktop\1Rad\easyrad\src\pages\BillingPage.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the corrupted block
corrupted = '      </div>UL TRANSACTION</div>\n         </div>\n       </div>'
# Try a more flexible replacement if needed
import re
new_content = re.sub(r'      </div>UL TRANSACTION</div>\s+</div>\s+</div>', '      </div>', content)

if new_content != content:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("SUCCESS: File repaired.")
else:
    print("FAILURE: Pattern not found.")
