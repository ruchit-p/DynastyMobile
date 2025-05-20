# Dynasty Mobile Documentation

This directory contains documentation for the Dynasty Mobile app.

## Authentication Documentation

1. **[auth_context_diagram.md](auth_context_diagram.md)** - A mermaid diagram showing the structure and relationships of the AuthContext components.

2. **[auth_flow_sequence.md](auth_flow_sequence.md)** - A mermaid sequence diagram showing the authentication flows for different sign-in methods.

3. **[auth_context_explanation.md](auth_context_explanation.md)** - Detailed explanation of how the authentication system works.

4. **[auth_context_interface.md](auth_context_interface.md)** - Documentation of the AuthContext interface, including properties and methods.

## Story Creation Documentation

1. **[story_creation_flow.md](story_creation_flow.md)** - A mermaid diagram showing the structure and flow of the story creation process.

2. **[story_creation_sequence.md](story_creation_sequence.md)** - A mermaid sequence diagram showing the detailed interactions during story creation.

3. **[story_creation_explanation.md](story_creation_explanation.md)** - Detailed explanation of how the story creation process works.

4. **[story_data_model.md](story_data_model.md)** - Documentation of the data model for stories, including Firestore structure and relationships.

## Viewing the Diagrams

The diagrams are written in Mermaid syntax. To view them:

### Option 1: GitHub

If you're viewing these files on GitHub, the mermaid diagrams will render automatically.

### Option 2: VS Code

Install the "Markdown Preview Mermaid Support" extension in VS Code, then preview the markdown files.

### Option 3: Mermaid Live Editor

1. Copy the mermaid code (content between the triple backticks)
2. Visit [Mermaid Live Editor](https://mermaid.live/)
3. Paste the code to render the diagram

### Option 4: Export as Images

You can export the diagrams as PNG or SVG files using the Mermaid CLI:

```bash
npm install -g @mermaid-js/mermaid-cli
mmdc -i auth_context_diagram.md -o auth_context_diagram.png
mmdc -i story_creation_flow.md -o story_creation_flow.png
```

## System Overview

The Dynasty Mobile app uses Firebase services with custom React implementations:

- **Authentication**: Firebase Authentication with custom React Context
- **Data Storage**: Firebase Firestore for structured data
- **Media Storage**: Firebase Storage for photos and videos
- **Cloud Functions**: Firebase Cloud Functions for backend processing

For detailed implementation, see the source code in the `apps/mobile/src/` directory.
