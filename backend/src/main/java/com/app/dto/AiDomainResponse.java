package com.app.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiDomainResponse {
    private String action;
    private String domain;
    @Builder.Default
    private List<ClassModel> classes = new ArrayList<>();
    @Builder.Default
    private List<RelationModel> relations = new ArrayList<>();
    @Builder.Default
    private boolean success = true;
    private String source;
    private String message;
}
