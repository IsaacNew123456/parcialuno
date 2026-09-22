package com.app.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class DiagramSaveRequest {

    @NotBlank(message = "El nombre del diagrama es obligatorio")
    private String name;

    private String contentJson;
    private List<ClassModel> classes;
    private List<RelationModel> relations;
}
