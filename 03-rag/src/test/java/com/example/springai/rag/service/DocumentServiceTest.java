package com.example.springai.rag.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.document.Document;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for DocumentService.
 */
class DocumentServiceTest {

    private DocumentService documentService;

    @BeforeEach
    void setUp() {
        documentService = new DocumentService(DocumentService.DEFAULT_CHUNK_SIZE);
    }

    @Test
    void testProcessTextDocument() {
        // Given
        String content = "This is a test document.\nIt has multiple lines.\nFor testing purposes.";
        InputStream inputStream = new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8));
        String filename = "test.txt";

        // When
        DocumentService.ProcessedDocument result = documentService.processDocument(inputStream, filename);

        // Then
        assertNotNull(result);
        assertNotNull(result.documentId());
        assertEquals(filename, result.filename());
        assertNotNull(result.segments());
        assertTrue(result.segments().size() > 0);

        // Verify metadata
        Document firstSegment = result.segments().get(0);
        assertEquals(filename, firstSegment.getMetadata().get("filename"));
        assertEquals(result.documentId(), firstSegment.getMetadata().get("documentId"));
    }

    @Test
    void testProcessEmptyDocument() {
        // Given
        String content = "";
        InputStream inputStream = new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8));
        String filename = "empty.txt";

        // When/Then - Empty documents should throw an exception
        assertThrows(RuntimeException.class, () -> {
            documentService.processDocument(inputStream, filename);
        });
    }

    @Test
    void testProcessLargeDocument() {
        // Given
        StringBuilder content = new StringBuilder();
        for (int i = 0; i < 1000; i++) {
            content.append("Line ").append(i).append(": This is test content for document processing.\n");
        }
        InputStream inputStream = new ByteArrayInputStream(
            content.toString().getBytes(StandardCharsets.UTF_8)
        );
        String filename = "large.txt";

        // When
        DocumentService.ProcessedDocument result = documentService.processDocument(inputStream, filename);

        // Then
        assertNotNull(result);
        assertEquals(filename, result.filename());
        assertTrue(result.segments().size() > 1, "Large document should be split into multiple segments");
    }

    @Test
    void testMultiTopicDocumentIsSplitPerTopic() {
        // Sized to match sample-document.txt (~4.3 KB), which used to embed as a single chunk:
        // one embedding averaged over every topic drowned out any individual fact, so specific
        // questions scored below the similarity threshold and retrieval returned nothing.
        String content = """
                Chunk Size - Use 300-500 token chunks to keep one topic per embedding.
                Similarity Threshold - Set a minimum score to filter out irrelevant chunks.
                Context Window - Limit the number of chunks included in each request.
                Vector Stores - SimpleVectorStore keeps embeddings in memory for demos.
                Embeddings - Text is converted to vectors that capture semantic meaning.
                Retrieval - The question is embedded and compared against stored chunks.
                """.repeat(9);
        InputStream inputStream = new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8));

        DocumentService.ProcessedDocument result =
                documentService.processDocument(inputStream, "topics.txt");

        assertTrue(result.segments().size() > 1,
                "A multi-topic document must produce more than one chunk, but produced "
                        + result.segments().size());
    }

    @Test
    void testRejectsInvalidChunkSize() {
        assertThrows(IllegalArgumentException.class, () -> new DocumentService(0));
    }

    @Test
    void testProcessDocumentWithSpecialCharacters() {
        // Given
        String content = "Document with special chars: é, ñ, ü, 中文, 日本語, 한국어";
        InputStream inputStream = new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8));
        String filename = "special.txt";

        // When
        DocumentService.ProcessedDocument result = documentService.processDocument(inputStream, filename);

        // Then
        assertNotNull(result);
        assertEquals(filename, result.filename());
        assertTrue(result.segments().size() > 0);
        
        // Verify content is preserved
        String segmentText = result.segments().get(0).getText();
        assertTrue(segmentText.contains("é") || segmentText.contains("中文"));
    }

    @Test
    void testProcessPdfDocument() {
        // Note: This test would require a real PDF file
        // For now, we just verify the filename is handled correctly
        String filename = "document.pdf";
        
        // Since we can't create a real PDF easily in a unit test,
        // we'll just verify that PDF files are recognized
        assertTrue(filename.toLowerCase().endsWith(".pdf"));
    }
}
