import pandas as pd
import sys

file_path = sys.argv[1]
df = pd.read_excel(file_path)
print(df.to_string())
