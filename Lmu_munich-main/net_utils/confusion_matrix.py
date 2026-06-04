import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sn


# https://stackoverflow.com/questions/65498782/how-to-dump-confusion-matrix-using-tensorboard-logger-in-pytorch-lightning/73388839#73388839

class IntHandler:
    def legend_artist(self, legend, orig_handle, fontsize, handlebox):
        x0, y0 = handlebox.xdescent, handlebox.ydescent
        text = plt.matplotlib.text.Text(x0, y0, str(orig_handle))
        handlebox.add_artist(text)
        return text

def visualize_confusion_matrix(confusion_matrix, class_mapping):
    confusion_matrix = confusion_matrix.astype(int)
    # sort dict by keys
    #sorted_mapping = dict(sorted(class_mapping.items(), key=lambda item: item[1]))

    df_cm = pd.DataFrame(
        confusion_matrix,
        index=class_mapping.keys(),
        columns=class_mapping.keys(),
    )
    fig, ax = plt.subplots(figsize=(7, 5))
    fig.subplots_adjust(left=0.2)
    sn.set(font_scale=1.0)
    sn.heatmap(df_cm, annot=True, annot_kws={"size": 14}, fmt='d', ax=ax, cmap='rocket_r')
    plt.yticks(rotation=0)
    #plt.tight_layout()
    plt.gcf().subplots_adjust(bottom=0.25, left=0.2)
    ax.legend(
        class_mapping.keys(),
        class_mapping.keys(),
        handler_map={int: IntHandler()},
        loc='upper left',
        bbox_to_anchor=(1.3, 1)
    )
    ax.set(ylabel='Actual Diagnosis', xlabel='Predicted Diagnosis')

    #aim_im = Image(fig, format='jpeg')
    return fig


