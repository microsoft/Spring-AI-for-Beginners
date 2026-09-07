package com.example.springai.agents.advisor;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * In-memory sink that buffers advisor log entries and pushes them
 * to any connected SSE clients in real time.
 */
@Component
public class AdvisorLogSink {

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L); // no timeout
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        try {
            emitter.send(SseEmitter.event().name("ready").data("connected"));
        } catch (IOException exception) {
            emitters.remove(emitter);
            emitter.completeWithError(exception);
        }
        return emitter;
    }

    public void emit(String direction, String message) {
        var event = new LogEvent(direction, message, System.currentTimeMillis());
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name("advisor-log")
                        .data(event));
            } catch (Exception e) {
                emitters.remove(emitter);
            }
        }
    }

    public record LogEvent(String direction, String message, long timestamp) {}
}
