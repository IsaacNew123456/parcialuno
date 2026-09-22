package com.app.dto.ai;

import com.app.dto.AiDomainResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusinessChatResponse {
    private String reply;
    private AiDomainResponse suggestedArchitecture;
    @Builder.Default
    private boolean success = true;
    private String source;
    private String message;
}
