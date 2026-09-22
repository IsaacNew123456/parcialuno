package com.app.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AiCommandRequest {
    private String prompt;
    private List<String> currentClasses = new ArrayList<>();

    public AiCommandRequest(String prompt) {
        this.prompt = prompt;
        this.currentClasses = new ArrayList<>();
    }
}
