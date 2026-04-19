import sys
import re

with open("src/pages/AdminPanel.tsx") as f:
    lines = f.readlines()

content = "".join(lines[2765:2980])

# simplistic tag extractor
tags = re.findall(r'</?[a-zA-Z0-9_]+', content)

stack = []
for t in tags:
    if t.startswith("</"):
        if not stack:
           print("Excess closing tag:", t)
        else:
           last = stack.pop()
           expected = "</" + last[1:]
           if t != expected:
               print(f"Mismatch: expected {expected} but got {t}")
    else:
        # if it is a self closing tag, we ignore it?
        # we can't easily know self-closing from this regex unless we match the whole tag
        pass

# let's just use a better way
import html.parser
class MyParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.line_offset = 2766
    
    def handle_starttag(self, tag, attrs):
        # some tags might be self closing, but HTMLParser might not know JSX ones.
        # usually we can just guess.
        pass

# Actually simpler: count <div and </div
print("div count:", content.count("<div"), content.count("</div"))
print("header count:", content.count("<header"), content.count("</header"))
print("button count:", content.count("<button"), content.count("</button"))
print("span count:", content.count("<span"), content.count("</span"))
print("p count:", content.count("<p "), content.count("</p>"))

