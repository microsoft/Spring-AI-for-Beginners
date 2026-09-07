package com.example.springai.agents.controller;

import com.example.springai.agents.advisor.AdvisorLogSink;
import com.example.springai.agents.service.AgentPatternsService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;

class AdvisorLogStreamTest {
    @Test
    void acknowledgesSubscriptionBeforeDeliveringAdvisorEvents() throws Exception {
        var sink = new AdvisorLogSink();
        var controller = new AgentPatternsController(mock(AgentPatternsService.class), sink);
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        var result = mvc.perform(get("/api/agents/logs"))
                .andExpect(request().asyncStarted())
                .andReturn();
        try {
            assertThat(result.getResponse().getContentAsString())
                    .contains("event:ready", "data:connected");
            sink.emit("REQUEST", "verification request");
            assertThat(result.getResponse().getContentAsString())
                    .containsSubsequence("event:ready", "event:advisor-log", "REQUEST", "verification request");
        } finally {
            result.getRequest().getAsyncContext().complete();
        }
    }
}