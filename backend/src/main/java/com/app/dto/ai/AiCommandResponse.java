package com.app.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiCommandResponse {
    private String action; // ADD_CLASS | UPDATE_CLASS | DELETE_CLASS | ADD_RELATION
    private Map<String, Object> data;
    private String rawPrompt;
    @Builder.Default
    private boolean success = true;
    private String message;

}
